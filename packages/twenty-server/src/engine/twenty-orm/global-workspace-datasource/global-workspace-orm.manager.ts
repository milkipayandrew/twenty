import { Injectable, type Type } from '@nestjs/common';

import { type ObjectLiteral } from 'typeorm';

import { PIPELINE_CONFIG_SYSTEM_API_KEY_ID } from 'src/engine/core-modules/auth/constants/pipeline-config-system-api-key.constant';
import { isApiKeyAuthContext } from 'src/engine/core-modules/auth/guards/is-api-key-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { buildObjectIdByNameMaps } from 'src/engine/metadata-modules/flat-object-metadata/utils/build-object-id-by-name-maps.util';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { GlobalWorkspaceDataSourceService } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.service';
import { ExecuteInWorkspaceContextOptions } from 'src/engine/twenty-orm/global-workspace-datasource/types/execute-in-workspace-context-options.type';
import type { WorkspaceRepository } from 'src/engine/twenty-orm/repository/workspace.repository';
import {
  type ORMWorkspaceContext,
  withWorkspaceContext,
} from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import type { RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceCacheDataMap } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';
import { convertClassNameToObjectMetadataName } from 'src/engine/workspace-manager/utils/convert-class-to-object-metadata-name.util';

@Injectable()
export class GlobalWorkspaceOrmManager {
  constructor(
    private readonly globalWorkspaceDataSourceService: GlobalWorkspaceDataSourceService,
    private readonly workspaceCacheService: WorkspaceCacheService,
  ) {}

  async getRepository<T extends ObjectLiteral>(
    workspaceId: string,
    workspaceEntity: Type<T>,
    permissionOptions?: RolePermissionConfig,
  ): Promise<WorkspaceRepository<T>>;

  async getRepository<T extends ObjectLiteral>(
    workspaceId: string,
    objectMetadataName: string,
    permissionOptions?: RolePermissionConfig,
  ): Promise<WorkspaceRepository<T>>;

  async getRepository<T extends ObjectLiteral>(
    _workspaceId: string,
    workspaceEntityOrObjectMetadataName: Type<T> | string,
    permissionOptions?: RolePermissionConfig,
  ): Promise<WorkspaceRepository<T>> {
    let objectMetadataName: string;

    if (typeof workspaceEntityOrObjectMetadataName === 'string') {
      objectMetadataName = workspaceEntityOrObjectMetadataName;
    } else {
      objectMetadataName = convertClassNameToObjectMetadataName(
        workspaceEntityOrObjectMetadataName.name,
      );
    }

    const globalDataSource = await this.getGlobalWorkspaceDataSource();

    return globalDataSource.getRepository<T>(
      objectMetadataName,
      permissionOptions,
    );
  }

  async getGlobalWorkspaceDataSource(): Promise<GlobalWorkspaceDataSource> {
    return this.globalWorkspaceDataSourceService.getGlobalWorkspaceDataSource();
  }

  async getGlobalWorkspaceDataSourceReplica(): Promise<GlobalWorkspaceDataSource> {
    return this.globalWorkspaceDataSourceService.getGlobalWorkspaceDataSourceReplica();
  }

  async executeInWorkspaceContext<T>(
    fn: () => T | Promise<T>,
    authContext?: WorkspaceAuthContext,
    options?: ExecuteInWorkspaceContextOptions,
  ): Promise<T> {
    const resolvedAuthContext = authContext ?? getWorkspaceAuthContext();
    const context = options?.lite
      ? await this.loadLiteWorkspaceContext(resolvedAuthContext)
      : await this.loadWorkspaceContext(resolvedAuthContext);

    return withWorkspaceContext(context, fn);
  }

  private async loadWorkspaceContext(
    authContext: WorkspaceAuthContext,
  ): Promise<ORMWorkspaceContext> {
    const workspaceId = authContext.workspace.id;

    const {
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps,
      featureFlagsMap,
      rolesPermissions: permissionsPerRoleId,
      ORMEntityMetadatas: entityMetadatas,
      userWorkspaceRoleMap,
      apiKeyRoleMap,
      flatRoleMaps,
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatIndexMaps',
      'featureFlagsMap',
      'rolesPermissions',
      'ORMEntityMetadatas',
      'userWorkspaceRoleMap',
      'apiKeyRoleMap',
      'flatRoleMaps',
      'flatRowLevelPermissionPredicateMaps',
      'flatRowLevelPermissionPredicateGroupMaps',
    ]);

    const { idByNameSingular: objectIdByNameSingular } =
      buildObjectIdByNameMaps(flatObjectMetadataMaps);

    return {
      authContext,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps,
      flatRowLevelPermissionPredicateMaps,
      flatRowLevelPermissionPredicateGroupMaps,
      objectIdByNameSingular,
      featureFlagsMap,
      permissionsPerRoleId,
      entityMetadatas,
      userWorkspaceRoleMap,
      apiKeyRoleMap: this.withSystemPipelineConfigApiKeyRole(
        authContext,
        apiKeyRoleMap,
        flatRoleMaps,
      ),
    };
  }

  // The system pipeline-config read principal (sentinel jti, minted from instance APP_SECRET) has no
  // core.apiKey/roleTarget row, so its synthetic apiKey.id is absent from the cached apiKeyRoleMap and
  // object-REST role resolution (resolveRoleIdFromAuthContext) yields undefined -> "Invalid auth context".
  // Mirror the metadata-path handling (ApiKeyRoleService) by mapping the sentinel to the workspace Admin
  // role here, so both permission-config and row-level-permission resolution find a role. Non-sentinel
  // principals are untouched; only a bearer holding the instance APP_SECRET can present this jti.
  private withSystemPipelineConfigApiKeyRole(
    authContext: WorkspaceAuthContext,
    apiKeyRoleMap: Record<string, string>,
    flatRoleMaps: WorkspaceCacheDataMap['flatRoleMaps'],
  ): Record<string, string> {
    if (
      !isApiKeyAuthContext(authContext) ||
      authContext.apiKey.id !== PIPELINE_CONFIG_SYSTEM_API_KEY_ID ||
      apiKeyRoleMap[PIPELINE_CONFIG_SYSTEM_API_KEY_ID]
    ) {
      return apiKeyRoleMap;
    }

    const adminRole =
      flatRoleMaps.byUniversalIdentifier[
        STANDARD_ROLE.admin.universalIdentifier
      ];

    if (!adminRole) {
      return apiKeyRoleMap;
    }

    return {
      ...apiKeyRoleMap,
      [PIPELINE_CONFIG_SYSTEM_API_KEY_ID]: adminRole.id,
    };
  }

  private async loadLiteWorkspaceContext(
    authContext: WorkspaceAuthContext,
  ): Promise<ORMWorkspaceContext> {
    const workspaceId = authContext.workspace.id;

    const {
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      ORMEntityMetadatas: entityMetadatas,
    } = await this.workspaceCacheService.getOrRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'ORMEntityMetadatas',
    ]);

    const { idByNameSingular: objectIdByNameSingular } =
      buildObjectIdByNameMaps(flatObjectMetadataMaps);

    return {
      authContext,
      flatObjectMetadataMaps,
      flatFieldMetadataMaps,
      flatIndexMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      flatRowLevelPermissionPredicateMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      flatRowLevelPermissionPredicateGroupMaps: {
        byUniversalIdentifier: {},
        universalIdentifierById: {},
        universalIdentifiersByApplicationId: {},
      },
      objectIdByNameSingular,
      featureFlagsMap: {} as ORMWorkspaceContext['featureFlagsMap'],
      permissionsPerRoleId: {},
      entityMetadatas,
      userWorkspaceRoleMap: {},
      apiKeyRoleMap: {},
    };
  }
}
