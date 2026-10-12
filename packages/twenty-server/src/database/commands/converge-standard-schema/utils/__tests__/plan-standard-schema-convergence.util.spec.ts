import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  type FieldMetadataComplexOption,
  FieldMetadataType,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS } from 'src/database/commands/converge-standard-schema/constants/converge-retired-standard-universal-identifiers.constant';
import {
  CONVERGE_CREATABLE_METADATA_NAMES,
  CONVERGE_NEVER_CREATED_METADATA_NAMES,
  type ConvergeFlatEntityMaps,
  planStandardSchemaConvergence,
} from 'src/database/commands/converge-standard-schema/utils/plan-standard-schema-convergence.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import { computeTwentyStandardApplicationAllFlatEntityMaps } from 'src/engine/workspace-manager/twenty-standard-application/utils/twenty-standard-application-all-flat-entity-maps.constant';

const WORKSPACE_ID = '20202020-1111-4111-8111-111111111111';
const TWENTY_STANDARD_APPLICATION_ID = '20202020-2222-4222-8222-222222222222';
const CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER =
  '20202020-3333-4333-8333-333333333333';
const NOW = '2024-01-01T00:00:00.000Z';

const TRACKED_METADATA_NAMES = [
  ...CONVERGE_CREATABLE_METADATA_NAMES,
  ...CONVERGE_NEVER_CREATED_METADATA_NAMES,
];

const computeBlueprint = (): ConvergeFlatEntityMaps =>
  computeTwentyStandardApplicationAllFlatEntityMaps({
    now: NOW,
    workspaceId: WORKSPACE_ID,
    twentyStandardApplicationId: TWENTY_STANDARD_APPLICATION_ID,
  }).allFlatEntityMaps;

const getMapsKey = (metadataName: string) =>
  `flat${metadataName.charAt(0).toUpperCase()}${metadataName.slice(1)}Maps` as keyof ConvergeFlatEntityMaps;

type LooseEntity = { universalIdentifier: string } & Record<string, unknown>;

const getEntities = (
  maps: ConvergeFlatEntityMaps,
  metadataName: string,
): Partial<Record<string, LooseEntity>> =>
  maps[getMapsKey(metadataName)].byUniversalIdentifier as Partial<
    Record<string, LooseEntity>
  >;

// A workspace that exactly matches the blueprint (its own copy of the maps).
const cloneAsExistingWorkspace = (
  blueprint: ConvergeFlatEntityMaps,
): ConvergeFlatEntityMaps =>
  Object.fromEntries(
    Object.entries(blueprint).map(([mapsKey, maps]) => [
      mapsKey,
      {
        ...maps,
        byUniversalIdentifier: Object.fromEntries(
          Object.entries(maps.byUniversalIdentifier).map(
            ([universalIdentifier, entity]) => [
              universalIdentifier,
              structuredClone(entity),
            ],
          ),
        ),
      },
    ]),
  ) as unknown as ConvergeFlatEntityMaps;

const referencesAny = (entity: LooseEntity, removed: Set<string>) =>
  Object.entries(entity).some(([key, value]) => {
    if (key === 'universalIdentifier') {
      return false;
    }

    if (key.endsWith('UniversalIdentifier') && typeof value === 'string') {
      return removed.has(value);
    }

    if (key === 'universalFlatIndexFieldMetadatas' && Array.isArray(value)) {
      return value.some((indexField) =>
        removed.has(indexField.fieldMetadataUniversalIdentifier),
      );
    }

    return false;
  });

// Simulates a workspace created before these entities joined the blueprint:
// removes them and, transitively, everything referencing them. Returns the
// removed universal identifiers by metadata name.
const removeFromWorkspace = (
  existing: ConvergeFlatEntityMaps,
  universalIdentifiers: string[],
): Record<string, Set<string>> => {
  const removed = new Set(universalIdentifiers);
  const removedByMetadataName: Record<string, Set<string>> = {};
  let hasChanged = true;

  while (hasChanged) {
    hasChanged = false;

    for (const metadataName of TRACKED_METADATA_NAMES) {
      const entities = getEntities(existing, metadataName);

      for (const [universalIdentifier, entity] of Object.entries(entities)) {
        if (!isDefined(entity)) {
          continue;
        }

        if (
          removed.has(universalIdentifier) ||
          referencesAny(entity, removed)
        ) {
          delete entities[universalIdentifier];
          removed.add(universalIdentifier);
          removedByMetadataName[metadataName] ??= new Set();
          removedByMetadataName[metadataName].add(universalIdentifier);
          hasChanged = true;
        }
      }
    }
  }

  return removedByMetadataName;
};

const toCreateUniversalIdentifiers = (
  plan: ReturnType<typeof planStandardSchemaConvergence>,
  metadataName: (typeof CONVERGE_CREATABLE_METADATA_NAMES)[number],
) =>
  new Set(
    plan.toCreate[metadataName].map((entity) => entity.universalIdentifier),
  );

const addCustomField = ({
  existing,
  objectUniversalIdentifier,
  name,
  universalIdentifier,
}: {
  existing: ConvergeFlatEntityMaps;
  objectUniversalIdentifier: string;
  name: string;
  universalIdentifier: string;
}) => {
  existing.flatFieldMetadataMaps.byUniversalIdentifier[universalIdentifier] = {
    universalIdentifier,
    name,
    objectMetadataUniversalIdentifier: objectUniversalIdentifier,
    applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
  } as unknown as FlatFieldMetadata;
};

describe('planStandardSchemaConvergence', () => {
  const blueprint = computeBlueprint();

  it('plans nothing when the workspace matches the blueprint', () => {
    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: cloneAsExistingWorkspace(blueprint),
      now: NOW,
    });

    for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
      expect(plan.toCreate[metadataName]).toEqual([]);
    }
    expect(plan.fieldMetadataToUpdate).toEqual([]);
    expect(plan.optionAdds).toBe(0);
    expect(plan.toDelete).toEqual({ fieldMetadata: [], viewField: [] });
    expect(plan.drift).toEqual([]);
    expect(plan.extra).toEqual([]);
    expect(plan.shadowed).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skippedDependents).toEqual({});
    expect(plan.skippedKinds).toEqual({
      role: 0,
      permissionFlag: 0,
      agent: 0,
      skill: 0,
    });
  });

  it('creates a missing field on an existing object with its view field', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const imagesFieldUniversalIdentifier =
      STANDARD_OBJECTS.appraisal.fields.images.universalIdentifier;

    const removed = removeFromWorkspace(existing, [
      imagesFieldUniversalIdentifier,
    ]);

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.toCreate.objectMetadata).toEqual([]);
    expect(toCreateUniversalIdentifiers(plan, 'fieldMetadata')).toEqual(
      new Set([imagesFieldUniversalIdentifier]),
    );
    expect(toCreateUniversalIdentifiers(plan, 'viewField')).toEqual(
      removed.viewField,
    );
    expect(toCreateUniversalIdentifiers(plan, 'viewField')).toContain(
      STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.images
        .universalIdentifier,
    );
  });

  it('creates a missing object with its fields, views, view fields and relations', () => {
    const existing = cloneAsExistingWorkspace(blueprint);

    const removed = removeFromWorkspace(existing, [
      STANDARD_OBJECTS.mls.universalIdentifier,
    ]);

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    // Exactly what the older workspace lacks, nothing more.
    for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
      if (metadataName === 'navigationMenuItem') {
        continue;
      }

      expect(toCreateUniversalIdentifiers(plan, metadataName)).toEqual(
        removed[metadataName] ?? new Set(),
      );
    }

    expect(toCreateUniversalIdentifiers(plan, 'objectMetadata')).toEqual(
      new Set([STANDARD_OBJECTS.mls.universalIdentifier]),
    );

    const plannedFields = toCreateUniversalIdentifiers(plan, 'fieldMetadata');

    expect(plannedFields).toContain(
      STANDARD_OBJECTS.mls.fields.name.universalIdentifier,
    );
    expect(plannedFields).toContain(
      STANDARD_OBJECTS.appraisal.fields.mls.universalIdentifier,
    );
    expect(plannedFields).toContain(
      STANDARD_OBJECTS.mls.fields.appraisals.universalIdentifier,
    );
    expect(toCreateUniversalIdentifiers(plan, 'view')).toContain(
      STANDARD_OBJECTS.mls.views.allMlses.universalIdentifier,
    );

    const plannedViewFields = toCreateUniversalIdentifiers(plan, 'viewField');

    expect(plannedViewFields).toContain(
      STANDARD_OBJECTS.mls.views.allMlses.viewFields.name.universalIdentifier,
    );
    expect(plannedViewFields).toContain(
      STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.mls
        .universalIdentifier,
    );
    expect(plan.shadowed).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.skippedDependents).toEqual({});
  });

  it('shadows a missing standard field whose name a custom field already uses, skipping its partner and view fields', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const candidatesUniversalIdentifier =
      STANDARD_OBJECTS.compsearch.fields.candidates.universalIdentifier;
    const candidateInCompsearchUniversalIdentifier =
      STANDARD_OBJECTS.comparable.fields.candidateInCompsearch
        .universalIdentifier;
    const customCandidatesUniversalIdentifier =
      '89b1ce00-0000-4000-8000-000000000001';

    const removed = removeFromWorkspace(existing, [
      candidatesUniversalIdentifier,
      candidateInCompsearchUniversalIdentifier,
    ]);

    addCustomField({
      existing,
      objectUniversalIdentifier:
        STANDARD_OBJECTS.compsearch.universalIdentifier,
      name: 'candidates',
      universalIdentifier: customCandidatesUniversalIdentifier,
    });

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.shadowed).toEqual([
      {
        kind: 'fieldMetadata',
        universalIdentifier: candidatesUniversalIdentifier,
        objectName: 'compsearch',
        name: 'candidates',
        existingUniversalIdentifier: customCandidatesUniversalIdentifier,
      },
    ]);
    // The relation partner and every entity pointing at the shadowed pair
    // (view fields, indexes...) are skipped, nothing else is planned.
    for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
      expect(plan.toCreate[metadataName]).toEqual([]);
    }
    expect(plan.skippedDependents.fieldMetadata).toBe(1);

    const removedDependentCount = Object.entries(removed)
      .filter(([metadataName]) => metadataName !== 'fieldMetadata')
      .reduce((total, [, universalIdentifiers]) => {
        return total + universalIdentifiers.size;
      }, 0);
    const skippedDependentCount = Object.entries(plan.skippedDependents)
      .filter(([metadataName]) => metadataName !== 'fieldMetadata')
      .reduce((total, [, count]) => total + (count ?? 0), 0);

    expect(skippedDependentCount).toBe(removedDependentCount);
    expect(plan.conflicts).toEqual([]);
  });

  it('shadows both sides when both relation field names are taken by custom fields', () => {
    const existing = cloneAsExistingWorkspace(blueprint);

    removeFromWorkspace(existing, [
      STANDARD_OBJECTS.compsearch.fields.candidates.universalIdentifier,
      STANDARD_OBJECTS.comparable.fields.candidateInCompsearch
        .universalIdentifier,
    ]);
    addCustomField({
      existing,
      objectUniversalIdentifier:
        STANDARD_OBJECTS.compsearch.universalIdentifier,
      name: 'candidates',
      universalIdentifier: '89b1ce00-0000-4000-8000-000000000001',
    });
    addCustomField({
      existing,
      objectUniversalIdentifier:
        STANDARD_OBJECTS.comparable.universalIdentifier,
      name: 'candidateInCompsearch',
      universalIdentifier: '028b73a8-0000-4000-8000-000000000002',
    });

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(
      plan.shadowed.map(({ objectName, name }) => `${objectName}.${name}`),
    ).toEqual(
      expect.arrayContaining([
        'compsearch.candidates',
        'comparable.candidateInCompsearch',
      ]),
    );
    expect(plan.shadowed).toHaveLength(2);
    expect(plan.toCreate.fieldMetadata).toEqual([]);
    expect(plan.skippedDependents.fieldMetadata).toBeUndefined();
  });

  it('reports a CONFLICT when a missing standard object name is taken by another object', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const customMlsUniversalIdentifier = '20202020-4444-4444-8444-444444444444';

    removeFromWorkspace(existing, [STANDARD_OBJECTS.mls.universalIdentifier]);
    existing.flatObjectMetadataMaps.byUniversalIdentifier[
      customMlsUniversalIdentifier
    ] = {
      universalIdentifier: customMlsUniversalIdentifier,
      nameSingular: 'mls',
      namePlural: 'mlses',
      applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    } as unknown as FlatObjectMetadata;

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.conflicts).toEqual([
      {
        kind: 'objectMetadata',
        universalIdentifier: STANDARD_OBJECTS.mls.universalIdentifier,
        name: 'mls',
        existingUniversalIdentifier: customMlsUniversalIdentifier,
      },
    ]);
    expect(plan.toCreate.objectMetadata).toEqual([]);
    expect(toCreateUniversalIdentifiers(plan, 'fieldMetadata')).not.toContain(
      STANDARD_OBJECTS.appraisal.fields.mls.universalIdentifier,
    );
    expect(
      plan.toCreate.fieldMetadata.filter(
        (field) =>
          field.objectMetadataUniversalIdentifier ===
            STANDARD_OBJECTS.mls.universalIdentifier ||
          field.relationTargetObjectMetadataUniversalIdentifier ===
            STANDARD_OBJECTS.mls.universalIdentifier,
      ),
    ).toEqual([]);
    expect(plan.toCreate.view).toEqual([]);
    expect(plan.skippedDependents.fieldMetadata).toBeGreaterThan(0);
  });

  it('appends a missing select option without touching existing options', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const statusField = existing.flatFieldMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.appraisal.fields.status.universalIdentifier
    ] as FlatFieldMetadata;
    const blueprintOptions =
      statusField.options as FieldMetadataComplexOption[];
    const userOptions = blueprintOptions
      .filter((option) => option.value !== 'COMP_SEARCH')
      .map((option, index) => ({
        ...option,
        position: index,
        ...(option.value === 'NEW'
          ? { label: 'Brand new (user label)', color: 'red' as const }
          : {}),
      }));

    statusField.options = userOptions;

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.optionAdds).toBe(1);
    expect(plan.fieldMetadataToUpdate).toHaveLength(1);

    const [updatedField] = plan.fieldMetadataToUpdate;
    const updatedOptions = updatedField.options as FieldMetadataComplexOption[];

    expect(updatedField.universalIdentifier).toBe(
      STANDARD_OBJECTS.appraisal.fields.status.universalIdentifier,
    );
    expect(updatedOptions.slice(0, userOptions.length)).toEqual(userOptions);
    expect(updatedOptions).toHaveLength(userOptions.length + 1);
    expect(updatedOptions[userOptions.length]).toMatchObject({
      value: 'COMP_SEARCH',
      position: userOptions.length,
    });
    for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
      expect(plan.toCreate[metadataName]).toEqual([]);
    }
  });

  it('never appends options to a field owned by another application', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const statusField = existing.flatFieldMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.appraisal.fields.status.universalIdentifier
    ] as FlatFieldMetadata;

    statusField.options = [];
    statusField.applicationUniversalIdentifier =
      CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER;

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.fieldMetadataToUpdate).toEqual([]);
    expect(plan.optionAdds).toBe(0);
  });

  it('leaves an existing hidden view field untouched while creating its missing siblings', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const nameViewFieldUniversalIdentifier =
      STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.name
        .universalIdentifier;
    const nameViewField = existing.flatViewFieldMaps.byUniversalIdentifier[
      nameViewFieldUniversalIdentifier
    ] as FlatViewField;

    nameViewField.isVisible = false;
    removeFromWorkspace(existing, [
      STANDARD_OBJECTS.appraisal.fields.reportLink.universalIdentifier,
    ]);

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    const plannedReportLinkViewField = plan.toCreate.viewField.find(
      (viewField) =>
        viewField.universalIdentifier ===
        STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.reportLink
          .universalIdentifier,
    );
    const blueprintReportLinkViewField =
      blueprint.flatViewFieldMaps.byUniversalIdentifier[
        STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.reportLink
          .universalIdentifier
      ];

    expect(plannedReportLinkViewField).toBeDefined();
    expect(plannedReportLinkViewField?.isVisible).toBe(
      blueprintReportLinkViewField?.isVisible,
    );
    expect(toCreateUniversalIdentifiers(plan, 'viewField')).not.toContain(
      nameViewFieldUniversalIdentifier,
    );
    expect(plan.fieldMetadataToUpdate).toEqual([]);
    expect(nameViewField.isVisible).toBe(false);
  });

  it('shadows a missing standard view field whose (view, field) slot another view field already occupies', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const subjectAddressViewFieldUniversalIdentifier =
      STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.subjectAddress
        .universalIdentifier;
    const reportLinkViewFieldUniversalIdentifier =
      STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.reportLink
        .universalIdentifier;
    const blueprintViewField = existing.flatViewFieldMaps.byUniversalIdentifier[
      subjectAddressViewFieldUniversalIdentifier
    ] as FlatViewField;
    const userColumnUniversalIdentifier =
      '20202020-4444-4444-8444-444444444444';

    // Live shape seen on the `appraisal` workspace: the column was added by
    // another app with its own universalIdentifier, so the standard one is
    // missing by UID while its (view, field) slot is taken.
    delete existing.flatViewFieldMaps.byUniversalIdentifier[
      subjectAddressViewFieldUniversalIdentifier
    ];
    existing.flatViewFieldMaps.byUniversalIdentifier[
      userColumnUniversalIdentifier
    ] = {
      ...structuredClone(blueprintViewField),
      universalIdentifier: userColumnUniversalIdentifier,
      applicationUniversalIdentifier: CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER,
    } as FlatViewField;
    removeFromWorkspace(existing, [
      STANDARD_OBJECTS.appraisal.fields.reportLink.universalIdentifier,
    ]);

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(toCreateUniversalIdentifiers(plan, 'viewField')).not.toContain(
      subjectAddressViewFieldUniversalIdentifier,
    );
    expect(toCreateUniversalIdentifiers(plan, 'viewField')).toContain(
      reportLinkViewFieldUniversalIdentifier,
    );
    expect(plan.shadowed).toEqual([
      expect.objectContaining({
        kind: 'viewField',
        universalIdentifier: subjectAddressViewFieldUniversalIdentifier,
        name: 'subjectAddress',
        existingUniversalIdentifier: userColumnUniversalIdentifier,
      }),
    ]);
  });

  it('does not treat a soft-deleted view field as occupying its slot', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const subjectAddressViewFieldUniversalIdentifier =
      STANDARD_OBJECTS.appraisal.views.allAppraisals.viewFields.subjectAddress
        .universalIdentifier;
    const blueprintViewField = existing.flatViewFieldMaps.byUniversalIdentifier[
      subjectAddressViewFieldUniversalIdentifier
    ] as FlatViewField;
    const deletedColumnUniversalIdentifier =
      '20202020-5555-4555-8555-555555555555';

    delete existing.flatViewFieldMaps.byUniversalIdentifier[
      subjectAddressViewFieldUniversalIdentifier
    ];
    existing.flatViewFieldMaps.byUniversalIdentifier[
      deletedColumnUniversalIdentifier
    ] = {
      ...structuredClone(blueprintViewField),
      universalIdentifier: deletedColumnUniversalIdentifier,
      deletedAt: NOW,
    } as FlatViewField;

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(toCreateUniversalIdentifiers(plan, 'viewField')).toEqual(
      new Set([subjectAddressViewFieldUniversalIdentifier]),
    );
    expect(plan.shadowed).toEqual([]);
  });

  it('never creates roles, permission flags, agents or skills, only counts them', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const counts: Record<string, number> = {};

    for (const metadataName of CONVERGE_NEVER_CREATED_METADATA_NAMES) {
      const entities = getEntities(existing, metadataName);
      const [firstUniversalIdentifier] = Object.keys(entities);

      counts[metadataName] = 0;

      if (isDefined(firstUniversalIdentifier)) {
        delete entities[firstUniversalIdentifier];
        counts[metadataName] = 1;
      }
    }

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.skippedKinds).toEqual(counts);
    expect(Object.values(counts).some((count) => count > 0)).toBe(true);
    expect(Object.keys(plan.toCreate)).toEqual(
      expect.not.arrayContaining([...CONVERGE_NEVER_CREATED_METADATA_NAMES]),
    );
    for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
      expect(plan.toCreate[metadataName]).toEqual([]);
    }
  });

  it('backfills a missing standard navigation menu item whose target object exists', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const navigationMenuItems = getEntities(existing, 'navigationMenuItem');
    const mlsNavigationMenuItem = Object.values(navigationMenuItems)
      .filter(isDefined)
      .find(
        (navigationMenuItem) =>
          navigationMenuItem.targetObjectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.mls.universalIdentifier,
      );

    expect(mlsNavigationMenuItem).toBeDefined();
    // A workspace created before "MLS Sources" joined the standard sidebar.
    delete navigationMenuItems[mlsNavigationMenuItem!.universalIdentifier];

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(toCreateUniversalIdentifiers(plan, 'navigationMenuItem')).toEqual(
      new Set([mlsNavigationMenuItem!.universalIdentifier]),
    );
    expect(plan.toCreate.objectMetadata).toEqual([]);
    for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
      if (metadataName !== 'navigationMenuItem') {
        expect(plan.toCreate[metadataName]).toEqual([]);
      }
    }
  });

  it('does not create a navigation menu item for a deactivated object', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const navigationMenuItems = getEntities(existing, 'navigationMenuItem');
    const mlsNavigationMenuItem = Object.values(navigationMenuItems)
      .filter(isDefined)
      .find(
        (navigationMenuItem) =>
          navigationMenuItem.targetObjectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.mls.universalIdentifier,
      );

    delete navigationMenuItems[mlsNavigationMenuItem!.universalIdentifier];
    (
      existing.flatObjectMetadataMaps.byUniversalIdentifier[
        STANDARD_OBJECTS.mls.universalIdentifier
      ] as FlatObjectMetadata
    ).isActive = false;

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.toCreate.navigationMenuItem).toEqual([]);
  });

  it('plans nothing on a second run once the navigation menu item exists', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const navigationMenuItems = getEntities(existing, 'navigationMenuItem');
    const mlsNavigationMenuItem = Object.values(navigationMenuItems)
      .filter(isDefined)
      .find(
        (navigationMenuItem) =>
          navigationMenuItem.targetObjectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.mls.universalIdentifier,
      )!;

    delete navigationMenuItems[mlsNavigationMenuItem.universalIdentifier];

    const firstPlan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    // Apply: the planned item now exists in the workspace.
    for (const navigationMenuItem of firstPlan.toCreate.navigationMenuItem) {
      navigationMenuItems[navigationMenuItem.universalIdentifier] =
        structuredClone(navigationMenuItem) as unknown as LooseEntity;
    }

    const secondPlan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(firstPlan.toCreate.navigationMenuItem).toHaveLength(1);
    expect(secondPlan.toCreate.navigationMenuItem).toEqual([]);
  });

  it('reports structural drift of an existing standard field without updating it', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const loginUrlField = existing.flatFieldMetadataMaps.byUniversalIdentifier[
      STANDARD_OBJECTS.mls.fields.loginUrl.universalIdentifier
    ] as FlatFieldMetadata;

    loginUrlField.isNullable = !loginUrlField.isNullable;
    // User-editable properties are not drift.
    loginUrlField.label = 'Portal address (user label)';

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.drift).toEqual([
      {
        kind: 'fieldMetadata',
        universalIdentifier:
          STANDARD_OBJECTS.mls.fields.loginUrl.universalIdentifier,
        objectName: 'mls',
        name: 'loginUrl',
        properties: ['isNullable'],
      },
    ]);
    expect(plan.fieldMetadataToUpdate).toEqual([]);
    expect(plan.toDelete).toEqual({ fieldMetadata: [], viewField: [] });
  });

  describe('retired standard entities', () => {
    const [
      retiredUsernameUniversalIdentifier,
      retiredPasswordUniversalIdentifier,
    ] = CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS.fieldMetadata;
    const [retiredUsernameViewFieldUniversalIdentifier] =
      CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS.viewField;

    // A workspace activated before mls lost username/password (8d8aed3711).
    const addRetiredMlsCredentials = (existing: ConvergeFlatEntityMaps) => {
      for (const [universalIdentifier, name] of [
        [retiredUsernameUniversalIdentifier, 'username'],
        [retiredPasswordUniversalIdentifier, 'password'],
      ]) {
        existing.flatFieldMetadataMaps.byUniversalIdentifier[
          universalIdentifier
        ] = {
          universalIdentifier,
          name,
          type: FieldMetadataType.TEXT,
          objectMetadataUniversalIdentifier:
            STANDARD_OBJECTS.mls.universalIdentifier,
          applicationUniversalIdentifier:
            TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
        } as unknown as FlatFieldMetadata;
      }
      existing.flatViewFieldMaps.byUniversalIdentifier[
        retiredUsernameViewFieldUniversalIdentifier
      ] = {
        universalIdentifier: retiredUsernameViewFieldUniversalIdentifier,
        viewUniversalIdentifier:
          STANDARD_OBJECTS.mls.views.allMlses.universalIdentifier,
        fieldMetadataUniversalIdentifier: retiredUsernameUniversalIdentifier,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      } as unknown as FlatViewField;
    };

    const toDeleteUniversalIdentifiers = (
      plan: ReturnType<typeof planStandardSchemaConvergence>,
    ) => ({
      fieldMetadata: new Set(
        plan.toDelete.fieldMetadata.map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
      ),
      viewField: new Set(
        plan.toDelete.viewField.map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
      ),
    });

    it('lists exactly mls.username, mls.password and the allMlses username column', () => {
      expect(CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS).toEqual({
        fieldMetadata: [
          '64d37046-4f92-4e64-bcc1-9057bd3e9cc9',
          '839b9460-e307-4b93-9d08-ed7187f4e6f0',
        ],
        viewField: ['bf460323-7cf5-4042-b41b-bbebbfffa899'],
      });
      // None of them is part of the current blueprint.
      for (const universalIdentifier of CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS.fieldMetadata) {
        expect(
          blueprint.flatFieldMetadataMaps.byUniversalIdentifier[
            universalIdentifier
          ],
        ).toBeUndefined();
      }
      expect(
        blueprint.flatViewFieldMaps.byUniversalIdentifier[
          retiredUsernameViewFieldUniversalIdentifier
        ],
      ).toBeUndefined();
    });

    it('plans the delete of listed retired entities owned by the standard application', () => {
      const existing = cloneAsExistingWorkspace(blueprint);

      addRetiredMlsCredentials(existing);

      const plan = planStandardSchemaConvergence({
        standardAllFlatEntityMaps: blueprint,
        existingAllFlatEntityMaps: existing,
        now: NOW,
      });

      expect(toDeleteUniversalIdentifiers(plan)).toEqual({
        fieldMetadata: new Set([
          retiredUsernameUniversalIdentifier,
          retiredPasswordUniversalIdentifier,
        ]),
        viewField: new Set([retiredUsernameViewFieldUniversalIdentifier]),
      });
      expect(plan.extra).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ objectName: 'mls', name: 'username' }),
          expect.objectContaining({ objectName: 'mls', name: 'password' }),
        ]),
      );
      for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
        expect(plan.toCreate[metadataName]).toEqual([]);
      }
    });

    it('never deletes a listed id owned by another application', () => {
      const existing = cloneAsExistingWorkspace(blueprint);

      addRetiredMlsCredentials(existing);
      for (const universalIdentifier of [
        retiredUsernameUniversalIdentifier,
        retiredPasswordUniversalIdentifier,
      ]) {
        existing.flatFieldMetadataMaps.byUniversalIdentifier[
          universalIdentifier
        ]!.applicationUniversalIdentifier =
          CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER;
      }
      existing.flatViewFieldMaps.byUniversalIdentifier[
        retiredUsernameViewFieldUniversalIdentifier
      ]!.applicationUniversalIdentifier =
        CUSTOM_APPLICATION_UNIVERSAL_IDENTIFIER;

      const plan = planStandardSchemaConvergence({
        standardAllFlatEntityMaps: blueprint,
        existingAllFlatEntityMaps: existing,
        now: NOW,
      });

      expect(plan.toDelete).toEqual({ fieldMetadata: [], viewField: [] });
    });

    it('reports a non-listed standard extra without deleting it', () => {
      const existing = cloneAsExistingWorkspace(blueprint);
      const unlistedExtraUniversalIdentifier =
        '20202020-6666-4666-8666-666666666666';

      existing.flatFieldMetadataMaps.byUniversalIdentifier[
        unlistedExtraUniversalIdentifier
      ] = {
        universalIdentifier: unlistedExtraUniversalIdentifier,
        name: 'legacyNotes',
        type: FieldMetadataType.TEXT,
        objectMetadataUniversalIdentifier:
          STANDARD_OBJECTS.mls.universalIdentifier,
        applicationUniversalIdentifier:
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER,
      } as unknown as FlatFieldMetadata;

      const plan = planStandardSchemaConvergence({
        standardAllFlatEntityMaps: blueprint,
        existingAllFlatEntityMaps: existing,
        now: NOW,
      });

      expect(plan.extra).toEqual([
        {
          kind: 'fieldMetadata',
          universalIdentifier: unlistedExtraUniversalIdentifier,
          objectName: 'mls',
          name: 'legacyNotes',
        },
      ]);
      expect(plan.toDelete).toEqual({ fieldMetadata: [], viewField: [] });
    });

    it('leaves a custom field with the same name untouched', () => {
      const existing = cloneAsExistingWorkspace(blueprint);
      const customUsernameUniversalIdentifier =
        '20202020-7777-4777-8777-777777777777';

      addCustomField({
        existing,
        objectUniversalIdentifier: STANDARD_OBJECTS.mls.universalIdentifier,
        name: 'username',
        universalIdentifier: customUsernameUniversalIdentifier,
      });

      const plan = planStandardSchemaConvergence({
        standardAllFlatEntityMaps: blueprint,
        existingAllFlatEntityMaps: existing,
        now: NOW,
      });

      expect(plan.toDelete).toEqual({ fieldMetadata: [], viewField: [] });
      expect(plan.extra).toEqual([]);
      expect(
        existing.flatFieldMetadataMaps.byUniversalIdentifier[
          customUsernameUniversalIdentifier
        ],
      ).toBeDefined();
    });

    it('is idempotent: nothing is planned once the retired entities are gone', () => {
      const existing = cloneAsExistingWorkspace(blueprint);

      addRetiredMlsCredentials(existing);

      const firstPlan = planStandardSchemaConvergence({
        standardAllFlatEntityMaps: blueprint,
        existingAllFlatEntityMaps: existing,
        now: NOW,
      });

      // Apply the deletes.
      for (const field of firstPlan.toDelete.fieldMetadata) {
        delete existing.flatFieldMetadataMaps.byUniversalIdentifier[
          field.universalIdentifier
        ];
      }
      for (const viewField of firstPlan.toDelete.viewField) {
        delete existing.flatViewFieldMaps.byUniversalIdentifier[
          viewField.universalIdentifier
        ];
      }

      const secondPlan = planStandardSchemaConvergence({
        standardAllFlatEntityMaps: blueprint,
        existingAllFlatEntityMaps: existing,
        now: NOW,
      });

      expect(firstPlan.toDelete.fieldMetadata).toHaveLength(2);
      expect(firstPlan.toDelete.viewField).toHaveLength(1);
      expect(secondPlan.toDelete).toEqual({ fieldMetadata: [], viewField: [] });
      expect(secondPlan.extra).toEqual([]);
    });
  });
});
