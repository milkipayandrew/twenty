import { InjectDataSource } from '@nestjs/typeorm';

import chalk from 'chalk';
import { Command } from 'nest-commander';
import { STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS } from 'twenty-shared/metadata';
import { DataSource } from 'typeorm';

import { ProvisionedWorkspaceCommandRunner } from 'src/database/commands/command-runners/provisioned-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import {
  type RunOnWorkspaceArgs,
  type WorkspaceCommandOptions,
} from 'src/database/commands/command-runners/workspace.command-runner';
import {
  countStandardSchemaConvergenceCreates,
  planStandardSchemaConvergence,
  type StandardSchemaConvergencePlan,
} from 'src/database/commands/converge-standard-schema/utils/plan-standard-schema-convergence.util';
import { CommandLogger } from 'src/database/commands/logger';
import { buildNavigationCommandMenuItemOperationsOrThrow } from 'src/database/commands/upgrade-version-command/2-10/utils/build-navigation-command-menu-item-operations-or-throw.util';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type AllFlatEntityOperationByMetadataName } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-to-create-delete-update.type';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { prefillMls } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-mls.util';
import { prefillPipelineConfig } from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-pipeline-config.util';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';

// Machine-readable per-workspace line consumed by scripts/converge-workspaces.sh.
export const CONVERGE_SCHEMA_RESULT_PREFIX = 'CONVERGE_SCHEMA_RESULT';

type SeedStatus = 'seeded' | 'failed' | 'not-needed' | 'disabled';

export type ConvergeSchemaResult = {
  workspaceId: string;
  dryRun: boolean;
  status: 'noop' | 'planned' | 'applied' | 'failed';
  toCreate: Record<string, number>;
  optionAdds: number;
  shadowed: {
    kind: string;
    objectName: string;
    name: string;
    universalIdentifier: string;
    existingUniversalIdentifier: string;
  }[];
  conflicts: StandardSchemaConvergencePlan['conflicts'];
  skippedDependents: Record<string, number>;
  skippedKinds: Record<string, number>;
  seed: { mls: SeedStatus; pipelineConfig: SeedStatus };
  error: string | null;
};

// Standalone (not @RegisteredWorkspaceCommand): it diffs the whole current
// standard blueprint on every run, so it converges any additive blueprint
// delta, is idempotent (nothing missing => noop) and fails closed.
@Command({
  name: 'workspace:converge-standard-schema',
  description:
    'Create-only convergence of existing workspaces onto the current standard metadata blueprint (missing objects, fields, views, view fields, indexes, page layouts; appends missing select options). Never updates or deletes existing metadata. Exits non-zero if any workspace fails.',
})
export class ConvergeStandardSchemaCommand extends ProvisionedWorkspaceCommandRunner {
  constructor(
    protected readonly workspaceIteratorService: WorkspaceIteratorService,
    private readonly applicationService: ApplicationService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMigrationValidateBuildAndRunService: WorkspaceMigrationValidateBuildAndRunService,
    private readonly twentyConfigService: TwentyConfigService,
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  // The base runner discards the iterator report, so per-workspace failures
  // would exit 0. Keep the report and fail the process instead.
  override async run(
    _passedParams: string[],
    options: WorkspaceCommandOptions,
  ): Promise<void> {
    if (options.verbose) {
      this.logger = new CommandLogger({
        verbose: true,
        constructorName: this.constructor.name,
      });
    }

    const report = await this.workspaceIteratorService.iterate({
      workspaceIds:
        options.workspaceId && options.workspaceId.size > 0
          ? Array.from(options.workspaceId)
          : undefined,
      activationStatuses: this.activationStatuses,
      startFromWorkspaceId: options.startFromWorkspaceId,
      workspaceCountLimit: options.workspaceCountLimit,
      dryRun: options.dryRun,
      callback: async (context) => {
        await this.runOnWorkspace({
          options,
          workspaceId: context.workspaceId,
          dataSource: context.dataSource,
          index: context.index,
          total: context.total,
        });
      },
    });

    if (report.fail.length > 0) {
      const failedWorkspaceIds = report.fail
        .map(({ workspaceId }) => workspaceId)
        .join(', ');

      this.logger.error(
        chalk.red(
          `${report.fail.length} workspace(s) failed: ${failedWorkspaceIds}`,
        ),
      );

      throw new Error(
        `workspace:converge-standard-schema failed on ${report.fail.length} workspace(s): ${failedWorkspaceIds}`,
      );
    }

    this.logger.log(chalk.blue('Command completed!'));
  }

  override async runOnWorkspace({
    workspaceId,
    options,
  }: RunOnWorkspaceArgs): Promise<void> {
    const isDryRun = options.dryRun ?? false;

    const result: ConvergeSchemaResult = {
      workspaceId,
      dryRun: isDryRun,
      status: 'failed',
      toCreate: {},
      optionAdds: 0,
      shadowed: [],
      conflicts: [],
      skippedDependents: {},
      skippedKinds: {},
      seed: { mls: 'not-needed', pipelineConfig: 'not-needed' },
      error: null,
    };

    try {
      await this.convergeWorkspace({ workspaceId, isDryRun, result });
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      this.emitResult(result);

      throw error;
    }

    this.emitResult(result);
  }

  private async convergeWorkspace({
    workspaceId,
    isDryRun,
    result,
  }: {
    workspaceId: string;
    isDryRun: boolean;
    result: ConvergeSchemaResult;
  }): Promise<void> {
    const existingAllFlatEntityMaps =
      await this.workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'flatFieldMetadataMaps',
        'flatIndexMaps',
        'flatSearchFieldMetadataMaps',
        'flatViewMaps',
        'flatViewFieldGroupMaps',
        'flatViewFieldMaps',
        'flatViewFilterMaps',
        'flatViewGroupMaps',
        'flatPageLayoutMaps',
        'flatPageLayoutTabMaps',
        'flatPageLayoutWidgetMaps',
        'flatNavigationMenuItemMaps',
        'flatCommandMenuItemMaps',
        'flatRoleMaps',
        'flatPermissionFlagMaps',
        'flatAgentMaps',
        'flatSkillMaps',
      ]);

    const { twentyStandardFlatApplication } =
      await this.applicationService.findWorkspaceTwentyStandardAndCustomApplicationOrThrow(
        { workspaceId },
      );

    const now = new Date().toISOString();

    const { allFlatEntityMaps: standardAllFlatEntityMaps } =
      computeTwentyStandardApplicationAllFlatEntityMaps({
        now,
        workspaceId,
        twentyStandardApplicationId: twentyStandardFlatApplication.id,
      });

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps,
      existingAllFlatEntityMaps,
      now,
    });

    const commandMenuItemOperations =
      buildNavigationCommandMenuItemOperationsOrThrow({
        existingFlatCommandMenuItemMaps:
          existingAllFlatEntityMaps.flatCommandMenuItemMaps,
        objectMetadatasForNavigation: plan.toCreate.objectMetadata,
        applicationId: twentyStandardFlatApplication.id,
        workspaceId,
        now,
        renamedCollisionObjectMetadatas: [],
      });

    result.toCreate = countStandardSchemaConvergenceCreates(plan.toCreate);

    if (commandMenuItemOperations.flatEntityToCreate.length > 0) {
      result.toCreate.commandMenuItem =
        commandMenuItemOperations.flatEntityToCreate.length;
    }

    result.optionAdds = plan.optionAdds;
    result.shadowed = plan.shadowed.map(
      ({
        kind,
        objectName,
        name,
        universalIdentifier,
        existingUniversalIdentifier,
      }) => ({
        kind,
        objectName,
        name,
        universalIdentifier,
        existingUniversalIdentifier,
      }),
    );
    result.conflicts = plan.conflicts;
    result.skippedDependents = plan.skippedDependents;
    result.skippedKinds = plan.skippedKinds;

    for (const { kind, objectName, name } of plan.shadowed) {
      this.logger.warn(
        `SHADOWED ${kind} ${objectName}.${name} on workspace ${workspaceId}: its name/slot is already taken by an entity with another universalIdentifier, not created`,
      );
    }

    if (plan.conflicts.length > 0) {
      throw new Error(
        `CONFLICT on workspace ${workspaceId}: standard object(s) ${plan.conflicts
          .map(({ name }) => name)
          .join(
            ', ',
          )} missing but their name is already taken by another object; refusing to rename user data`,
      );
    }

    const createCount = Object.values(result.toCreate).reduce(
      (total, count) => total + count,
      0,
    );

    if (createCount === 0 && plan.fieldMetadataToUpdate.length === 0) {
      result.status = 'noop';

      return;
    }

    const allFlatEntityOperationByMetadataName: AllFlatEntityOperationByMetadataName =
      {
        ...Object.fromEntries(
          Object.entries(plan.toCreate).map(([metadataName, entities]) => [
            metadataName,
            {
              flatEntityToCreate: entities,
              flatEntityToDelete: [],
              flatEntityToUpdate: [],
            },
          ]),
        ),
        fieldMetadata: {
          flatEntityToCreate: plan.toCreate.fieldMetadata,
          flatEntityToDelete: [],
          flatEntityToUpdate: plan.fieldMetadataToUpdate,
        },
        commandMenuItem: commandMenuItemOperations,
      };

    // Always run the real validator, also in --dry-run, so collisions and
    // unresolved foreign keys are caught by the plan, not by the apply.
    const validateBuildAndRunResult =
      await this.workspaceMigrationValidateBuildAndRunService.validateBuildAndRunLegacyWorkspaceMigration(
        {
          isSystemBuild: true,
          applicationUniversalIdentifier:
            twentyStandardFlatApplication.universalIdentifier,
          workspaceId,
          allFlatEntityOperationByMetadataName,
          dryRun: isDryRun,
        },
      );

    if (validateBuildAndRunResult.status === 'fail') {
      throw new Error(
        `Standard schema convergence validation failed for workspace ${workspaceId}: ${JSON.stringify(
          validateBuildAndRunResult,
        )}`,
      );
    }

    if (isDryRun) {
      result.status = 'planned';

      return;
    }

    result.status = 'applied';

    this.logger.log(
      `Applied standard schema convergence on workspace ${workspaceId}: ${JSON.stringify(result.toCreate)}, ${plan.optionAdds} option(s) appended`,
    );

    await this.seedCreatedStandardObjects({ workspaceId, plan, result });
  }

  // Default rows are data, not schema: seeded idempotently only for objects
  // created in this run, never failing the workspace (matches activation).
  private async seedCreatedStandardObjects({
    workspaceId,
    plan,
    result,
  }: {
    workspaceId: string;
    plan: StandardSchemaConvergencePlan;
    result: ConvergeSchemaResult;
  }): Promise<void> {
    const createdObjectUniversalIdentifiers = new Set(
      plan.toCreate.objectMetadata.map(
        (objectMetadata) => objectMetadata.universalIdentifier,
      ),
    );
    const schemaName = getWorkspaceSchemaName(workspaceId);

    if (
      createdObjectUniversalIdentifiers.has(
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.mls,
      )
    ) {
      try {
        await prefillMls(this.coreDataSource.manager, schemaName);
        result.seed.mls = 'seeded';
      } catch (error) {
        result.seed.mls = 'failed';
        this.logger.error(
          `Non-critical: failed to seed the default mls row for workspace ${workspaceId}: ${(error as Error).message}`,
        );
      }
    }

    if (
      createdObjectUniversalIdentifiers.has(
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.pipelineConfig,
      )
    ) {
      if (!this.twentyConfigService.get('PIPELINE_DATA_CONFIG_ENABLED')) {
        result.seed.pipelineConfig = 'disabled';

        return;
      }

      try {
        await prefillPipelineConfig(this.coreDataSource.manager, schemaName);
        result.seed.pipelineConfig = 'seeded';
      } catch (error) {
        result.seed.pipelineConfig = 'failed';
        this.logger.error(
          `Non-critical: failed to seed the pipelineConfig row for workspace ${workspaceId}: ${(error as Error).message}`,
        );
      }
    }
  }

  private emitResult(result: ConvergeSchemaResult): void {
    // Written raw (no logger prefix/colors) so the line starts with the prefix.
    process.stdout.write(
      `${CONVERGE_SCHEMA_RESULT_PREFIX} ${JSON.stringify(result)}\n`,
    );
  }
}
