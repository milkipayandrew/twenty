import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type FieldMetadataComplexOption } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

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

  it('only adds navigation menu items for objects created in this run', () => {
    const existing = cloneAsExistingWorkspace(blueprint);
    const navigationMenuItems = getEntities(existing, 'navigationMenuItem');
    const appraisalNavigationMenuItem = Object.values(navigationMenuItems)
      .filter(isDefined)
      .find(
        (navigationMenuItem) =>
          navigationMenuItem.targetObjectMetadataUniversalIdentifier ===
          STANDARD_OBJECTS.appraisal.universalIdentifier,
      );

    expect(appraisalNavigationMenuItem).toBeDefined();
    // The user removed the appraisal nav item: it must stay removed.
    delete navigationMenuItems[
      appraisalNavigationMenuItem!.universalIdentifier
    ];

    const plan = planStandardSchemaConvergence({
      standardAllFlatEntityMaps: blueprint,
      existingAllFlatEntityMaps: existing,
      now: NOW,
    });

    expect(plan.toCreate.navigationMenuItem).toEqual([]);
  });
});
