import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command, CommandRunner } from 'nest-commander';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { SignInUpService } from 'src/engine/core-modules/auth/services/sign-in-up.service';
import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

// Overridable per-deploy through the DEMO_WORKSPACE_* env vars. Plain process.env
// reads (not TwentyConfigService config vars) because they are demo-provisioning
// knobs, not part of the server config schema.
// NB: 'demo' is in Twenty's RESERVED_SUBDOMAINS blocklist (validation rejects it),
// so the demo workspace lives at the product-aligned 'appraisal' subdomain instead.
// The demo user gets a DEDICATED email (demo@appraisal.local) — core.user.email is
// globally unique, so it must not collide with real human logins (e.g. the existing
// admin@appraisal.local account).
const DEFAULT_DEMO_SUBDOMAIN = 'appraisal';
const DEFAULT_DEMO_DISPLAY_NAME = 'Appraisal Demo';
const DEFAULT_DEMO_EMAIL = 'demo@appraisal.local';
const DEFAULT_DEMO_PASSWORD = 'Appraisal2026!';

@Command({
  name: 'workspace:create-demo',
  description:
    'Create the demo workspace + pre-verified demo user (idempotent, skips if the demo workspace already exists)',
})
export class CreateDemoWorkspaceCommand extends CommandRunner {
  private readonly logger = new Logger(CreateDemoWorkspaceCommand.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly signInUpService: SignInUpService,
    private readonly workspaceService: WorkspaceService,
    private readonly coreEntityCacheService: CoreEntityCacheService,
  ) {
    super();
  }

  async run(): Promise<void> {
    const subdomain =
      process.env.DEMO_WORKSPACE_SUBDOMAIN?.trim() || DEFAULT_DEMO_SUBDOMAIN;
    const displayName =
      process.env.DEMO_WORKSPACE_DISPLAY_NAME?.trim() ||
      DEFAULT_DEMO_DISPLAY_NAME;
    const email =
      process.env.DEMO_WORKSPACE_EMAIL?.trim() || DEFAULT_DEMO_EMAIL;
    const password = process.env.DEMO_WORKSPACE_PASSWORD || DEFAULT_DEMO_PASSWORD;

    // Idempotency: findOne excludes soft-deleted rows (deletedAt IS NULL), so an
    // existing demo workspace short-circuits without any destructive reseed.
    const existingWorkspace = await this.workspaceRepository.findOne({
      where: { subdomain },
    });

    if (isDefined(existingWorkspace)) {
      this.logger.log(
        `Demo workspace "${subdomain}" already exists (id ${existingWorkspace.id}, status ${existingWorkspace.activationStatus}), skipping.`,
      );

      return;
    }

    this.logger.log(`Creating demo workspace "${subdomain}"...`);

    // Build a pre-verified new user (bcrypt password hash + isEmailVerified) the
    // same way the real sign-up path does, so no email verification is required.
    const newUserWithPicture =
      await this.signInUpService.computePartialUserFromUserPayload(
        {
          email,
          firstName: 'Demo',
          lastName: 'Admin',
          isEmailAlreadyVerified: true,
        },
        { provider: AuthProviderEnum.Password, password },
      );

    // Same service the sign-up mutation uses: creates the workspace
    // (PENDING_CREATION) + user + userWorkspace membership.
    const { user, workspace } = await this.signInUpService.signUpOnNewWorkspace(
      { type: 'newUserWithPicture', newUserWithPicture },
      { displayName, subdomain },
    );

    // activateWorkspace needs an AuthContextUser (dates cast to string). The core
    // entity cache recomputes it straight from the just-committed user row.
    const authContextUser = await this.coreEntityCacheService.get(
      'user',
      user.id,
    );

    if (!isDefined(authContextUser)) {
      throw new Error(
        `Failed to resolve auth context for demo user ${user.id}`,
      );
    }

    // Activation is the step that seeds the appraisal Standard-app schema, sets up
    // default roles (assigning Admin to this creating user), and installs the
    // pre-installed apps — exactly like a real signup activation.
    await this.workspaceService.activateWorkspace(authContextUser, workspace);

    this.logger.log('Demo workspace created and activated.');
    this.logger.log(`  Workspace id: ${workspace.id}`);
    this.logger.log(`  Subdomain:    ${subdomain}`);
    this.logger.log(`  Email:        ${email}`);
    this.logger.log(`  Password:     ${password}`);
  }
}
