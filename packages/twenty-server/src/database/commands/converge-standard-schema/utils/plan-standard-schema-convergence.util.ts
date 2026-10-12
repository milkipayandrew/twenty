import { TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER } from 'twenty-shared/application';
import { type AllMetadataName } from 'twenty-shared/metadata';
import {
  type FieldMetadataComplexOption,
  FieldMetadataType,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 as uuidv4 } from 'uuid';

import { ALL_MANY_TO_ONE_METADATA_RELATIONS } from 'src/engine/metadata-modules/flat-entity/constant/all-many-to-one-metadata-relations.constant';
import { CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS } from 'src/database/commands/converge-standard-schema/constants/converge-retired-standard-universal-identifiers.constant';
import { type AllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/all-flat-entity-maps.type';
import { type MetadataFlatEntity } from 'src/engine/metadata-modules/flat-entity/types/metadata-flat-entity.type';
import { type MetadataToFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/types/metadata-to-flat-entity-maps-key';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { isFlatFieldMetadataOfTypes } from 'src/engine/metadata-modules/flat-field-metadata/utils/is-flat-field-metadata-of-types.util';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';

// Kinds the convergence creates when they are missing (by universalIdentifier)
// from an existing workspace. Existing entities are never updated or deleted,
// except for the append-only select option rule and the explicit retired list
// (CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS) below.
export const CONVERGE_CREATABLE_METADATA_NAMES = [
  'objectMetadata',
  'fieldMetadata',
  'index',
  'searchFieldMetadata',
  'view',
  'viewFieldGroup',
  'viewField',
  'viewFilter',
  'viewGroup',
  'pageLayout',
  'pageLayoutTab',
  'pageLayoutWidget',
  'navigationMenuItem',
] as const satisfies AllMetadataName[];

// Kinds that are never created by the convergence: they carry permissions or
// AI behaviour a human must opt into. Missing ones are only counted.
export const CONVERGE_NEVER_CREATED_METADATA_NAMES = [
  'role',
  'permissionFlag',
  'agent',
  'skill',
] as const satisfies AllMetadataName[];

export type ConvergeCreatableMetadataName =
  (typeof CONVERGE_CREATABLE_METADATA_NAMES)[number];

export type ConvergeNeverCreatedMetadataName =
  (typeof CONVERGE_NEVER_CREATED_METADATA_NAMES)[number];

type ConvergeTrackedMetadataName =
  | ConvergeCreatableMetadataName
  | ConvergeNeverCreatedMetadataName;

export type ConvergeFlatEntityMaps = Pick<
  AllFlatEntityMaps,
  MetadataToFlatEntityMapsKey<ConvergeTrackedMetadataName>
>;

export type StandardSchemaShadowedEntry = {
  kind: 'fieldMetadata' | 'viewField' | 'searchFieldMetadata' | 'index';
  universalIdentifier: string;
  objectName: string;
  name: string;
  existingUniversalIdentifier: string;
};

export type StandardSchemaConflictEntry = {
  kind: 'objectMetadata';
  universalIdentifier: string;
  name: string;
  existingUniversalIdentifier: string;
};

// An existing object or field whose structural definition differs from the
// blueprint. The convergence never updates it, so it is reported instead.
export type StandardSchemaDriftEntry = {
  kind: 'objectMetadata' | 'fieldMetadata';
  universalIdentifier: string;
  objectName: string;
  name: string;
  properties: string[];
};

// An object or field owned by the standard application that the blueprint no
// longer declares. Report-only: the convergence deletes it only when its id is
// on the retired list (see `toDelete`).
export type StandardSchemaExtraEntry = {
  kind: 'objectMetadata' | 'fieldMetadata';
  universalIdentifier: string;
  objectName: string;
  name: string;
};

export type StandardSchemaConvergencePlan = {
  toCreate: {
    [P in ConvergeCreatableMetadataName]: MetadataFlatEntity<P>[];
  };
  // Retired standard entities still present in the workspace: listed in
  // CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS, owned by the standard
  // application and absent from the current blueprint. Nothing else is ever
  // deleted.
  toDelete: {
    fieldMetadata: FlatFieldMetadata[];
    viewField: FlatViewField[];
  };
  drift: StandardSchemaDriftEntry[];
  extra: StandardSchemaExtraEntry[];
  // Existing standard SELECT / MULTI_SELECT fields with blueprint option values
  // appended (existing options, ids, labels, colors and order are preserved).
  fieldMetadataToUpdate: FlatFieldMetadata[];
  optionAdds: number;
  shadowed: StandardSchemaShadowedEntry[];
  conflicts: StandardSchemaConflictEntry[];
  // Missing blueprint entities not created because an entity they depend on is
  // shadowed, conflicting or otherwise unresolvable.
  skippedDependents: Partial<Record<ConvergeCreatableMetadataName, number>>;
  skippedKinds: Record<ConvergeNeverCreatedMetadataName, number>;
};

type AnyFlatEntity = { universalIdentifier: string } & Record<string, unknown>;

type EntityMapsByUniversalIdentifier = Partial<Record<string, AnyFlatEntity>>;

const getByUniversalIdentifier = (
  allFlatEntityMaps: ConvergeFlatEntityMaps,
  metadataName: ConvergeTrackedMetadataName,
): EntityMapsByUniversalIdentifier =>
  allFlatEntityMaps[getMetadataFlatEntityMapsKey(metadataName)]
    .byUniversalIdentifier as EntityMapsByUniversalIdentifier;

const isTrackedMetadataName = (
  metadataName: string,
): metadataName is ConvergeCreatableMetadataName =>
  (CONVERGE_CREATABLE_METADATA_NAMES as readonly string[]).includes(
    metadataName,
  );

// Universal foreign keys of an entity, as (target metadata name, target uid).
const getUniversalReferences = (
  metadataName: ConvergeCreatableMetadataName,
  entity: AnyFlatEntity,
): { metadataName: string; universalIdentifier: string }[] => {
  const relations = Object.values(
    ALL_MANY_TO_ONE_METADATA_RELATIONS[metadataName],
  ) as ({ metadataName: string; universalForeignKey: string } | null)[];

  const references = relations.flatMap((relation) => {
    if (!isDefined(relation)) {
      return [];
    }

    const universalIdentifier = entity[relation.universalForeignKey];

    return typeof universalIdentifier === 'string'
      ? [{ metadataName: relation.metadataName, universalIdentifier }]
      : [];
  });

  if (metadataName === 'index') {
    const indexFields = (entity.universalFlatIndexFieldMetadatas ?? []) as {
      fieldMetadataUniversalIdentifier: string;
    }[];

    for (const indexField of indexFields) {
      references.push({
        metadataName: 'fieldMetadata',
        universalIdentifier: indexField.fieldMetadataUniversalIdentifier,
      });
    }
  }

  return references;
};

const computeSelectOptionAppends = ({
  standardFieldMetadatas,
  existingFieldMaps,
  now,
}: {
  standardFieldMetadatas: FlatFieldMetadata[];
  existingFieldMaps: Partial<Record<string, FlatFieldMetadata>>;
  now: string;
}): { fieldMetadataToUpdate: FlatFieldMetadata[]; optionAdds: number } => {
  const fieldMetadataToUpdate: FlatFieldMetadata[] = [];
  let optionAdds = 0;

  for (const standardField of standardFieldMetadatas) {
    const existingField = existingFieldMaps[standardField.universalIdentifier];

    if (
      !isDefined(existingField) ||
      existingField.applicationUniversalIdentifier !==
        TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER ||
      !isFlatFieldMetadataOfTypes(existingField, [
        FieldMetadataType.SELECT,
        FieldMetadataType.MULTI_SELECT,
      ]) ||
      existingField.type !== standardField.type
    ) {
      continue;
    }

    const existingOptions = (existingField.options ??
      []) as FieldMetadataComplexOption[];
    const standardOptions = (standardField.options ??
      []) as FieldMetadataComplexOption[];

    const existingValues = new Set(
      existingOptions.map((option) => option.value),
    );
    const existingIds = new Set(
      existingOptions.map((option) => option.id).filter(isDefined),
    );

    const missingOptions = standardOptions.filter(
      (option) => !existingValues.has(option.value),
    );

    if (missingOptions.length === 0) {
      continue;
    }

    let nextPosition =
      existingOptions.reduce(
        (maxPosition, option) => Math.max(maxPosition, option.position),
        -1,
      ) + 1;

    const appendedOptions = missingOptions.map((option) => ({
      ...option,
      id:
        isDefined(option.id) && !existingIds.has(option.id)
          ? option.id
          : uuidv4(),
      position: nextPosition++,
    }));

    optionAdds += appendedOptions.length;

    fieldMetadataToUpdate.push({
      ...existingField,
      options: [...existingOptions, ...appendedOptions],
      updatedAt: now,
    } as FlatFieldMetadata);
  }

  return { fieldMetadataToUpdate, optionAdds };
};

// What makes an object or field "the same" for the code that reads and writes
// records. Labels, icons, descriptions and isActive are user-editable and are
// deliberately not compared.
const OBJECT_STRUCTURAL_PROPERTIES = [
  'nameSingular',
  'namePlural',
  'isSystem',
  'isRemote',
] as const;

const FIELD_STRUCTURAL_PROPERTIES = [
  'name',
  'type',
  'isNullable',
  'isUnique',
  'defaultValue',
  'universalSettings',
  'objectMetadataUniversalIdentifier',
  'relationTargetObjectMetadataUniversalIdentifier',
  'relationTargetFieldMetadataUniversalIdentifier',
] as const;

// A same-named field with another universalIdentifier stands in for the
// blueprint field: its identity and relation partner differ by construction.
const SHADOWING_FIELD_STRUCTURAL_PROPERTIES = [
  'type',
  'isNullable',
  'isUnique',
  'universalSettings',
  'relationTargetObjectMetadataUniversalIdentifier',
] as const;

// Key-order independent, and null / undefined / {} / missing key all compare
// equal, so a stored JSON column matches the blueprint literal.
const toComparable = (value: unknown): unknown => {
  if (!isDefined(value)) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(toComparable);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => [key, toComparable(entryValue)] as const)
      .filter(([, entryValue]) => entryValue !== null)
      .sort(([left], [right]) => left.localeCompare(right));

    return entries.length === 0 ? null : Object.fromEntries(entries);
  }

  return value;
};

const getDifferingProperties = (
  standardEntity: AnyFlatEntity,
  existingEntity: AnyFlatEntity,
  properties: readonly string[],
): string[] =>
  properties.filter(
    (property) =>
      JSON.stringify(toComparable(standardEntity[property])) !==
      JSON.stringify(toComparable(existingEntity[property])),
  );

const computeStructuralDrift = ({
  standardAllFlatEntityMaps,
  existingAllFlatEntityMaps,
  shadowed,
  getObjectName,
}: {
  standardAllFlatEntityMaps: ConvergeFlatEntityMaps;
  existingAllFlatEntityMaps: ConvergeFlatEntityMaps;
  shadowed: StandardSchemaShadowedEntry[];
  getObjectName: (objectUniversalIdentifier: string) => string;
}): StandardSchemaDriftEntry[] => {
  const drift: StandardSchemaDriftEntry[] = [];
  const standardObjects = getByUniversalIdentifier(
    standardAllFlatEntityMaps,
    'objectMetadata',
  );
  const existingObjects = getByUniversalIdentifier(
    existingAllFlatEntityMaps,
    'objectMetadata',
  );
  const standardFields = getByUniversalIdentifier(
    standardAllFlatEntityMaps,
    'fieldMetadata',
  );
  const existingFields = getByUniversalIdentifier(
    existingAllFlatEntityMaps,
    'fieldMetadata',
  );

  for (const standardObject of Object.values(standardObjects)) {
    const existingObject = isDefined(standardObject)
      ? existingObjects[standardObject.universalIdentifier]
      : undefined;

    if (!isDefined(standardObject) || !isDefined(existingObject)) {
      continue;
    }

    const properties = getDifferingProperties(
      standardObject,
      existingObject,
      OBJECT_STRUCTURAL_PROPERTIES,
    );

    if (properties.length > 0) {
      drift.push({
        kind: 'objectMetadata',
        universalIdentifier: standardObject.universalIdentifier,
        objectName: String(standardObject.nameSingular),
        name: String(standardObject.nameSingular),
        properties,
      });
    }
  }

  const shadowingFieldUniversalIdentifiers = new Map(
    shadowed
      .filter(({ kind }) => kind === 'fieldMetadata')
      .map(({ universalIdentifier, existingUniversalIdentifier }) => [
        universalIdentifier,
        existingUniversalIdentifier,
      ]),
  );

  for (const standardField of Object.values(standardFields)) {
    if (!isDefined(standardField)) {
      continue;
    }

    const shadowingFieldUniversalIdentifier =
      shadowingFieldUniversalIdentifiers.get(standardField.universalIdentifier);
    const existingField =
      existingFields[
        shadowingFieldUniversalIdentifier ?? standardField.universalIdentifier
      ];

    if (!isDefined(existingField)) {
      continue;
    }

    const properties = getDifferingProperties(
      standardField,
      existingField,
      isDefined(shadowingFieldUniversalIdentifier)
        ? SHADOWING_FIELD_STRUCTURAL_PROPERTIES
        : FIELD_STRUCTURAL_PROPERTIES,
    );

    if (properties.length > 0) {
      drift.push({
        kind: 'fieldMetadata',
        universalIdentifier: standardField.universalIdentifier,
        objectName: getObjectName(
          standardField.objectMetadataUniversalIdentifier as string,
        ),
        name: String(standardField.name),
        properties,
      });
    }
  }

  return drift;
};

const computeStandardExtras = ({
  standardAllFlatEntityMaps,
  existingAllFlatEntityMaps,
  getObjectName,
}: {
  standardAllFlatEntityMaps: ConvergeFlatEntityMaps;
  existingAllFlatEntityMaps: ConvergeFlatEntityMaps;
  getObjectName: (objectUniversalIdentifier: string) => string;
}): StandardSchemaExtraEntry[] =>
  (['objectMetadata', 'fieldMetadata'] as const).flatMap((kind) => {
    const standard = getByUniversalIdentifier(standardAllFlatEntityMaps, kind);

    return Object.values(
      getByUniversalIdentifier(existingAllFlatEntityMaps, kind),
    )
      .filter(isDefined)
      .filter(
        (existingEntity) =>
          existingEntity.applicationUniversalIdentifier ===
            TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER &&
          !isDefined(standard[existingEntity.universalIdentifier]),
      )
      .map((existingEntity) => ({
        kind,
        universalIdentifier: existingEntity.universalIdentifier,
        objectName:
          kind === 'objectMetadata'
            ? String(existingEntity.nameSingular)
            : getObjectName(
                existingEntity.objectMetadataUniversalIdentifier as string,
              ),
        name: String(
          kind === 'objectMetadata'
            ? existingEntity.nameSingular
            : existingEntity.name,
        ),
      }));
  });

export type ConvergeRetiredUniversalIdentifiers = {
  fieldMetadata: readonly string[];
  viewField: readonly string[];
};

const computeRetiredToDelete = ({
  standardAllFlatEntityMaps,
  existingAllFlatEntityMaps,
  retiredUniversalIdentifiers,
}: {
  standardAllFlatEntityMaps: ConvergeFlatEntityMaps;
  existingAllFlatEntityMaps: ConvergeFlatEntityMaps;
  retiredUniversalIdentifiers: ConvergeRetiredUniversalIdentifiers;
}): StandardSchemaConvergencePlan['toDelete'] => {
  const findRetired = (kind: 'fieldMetadata' | 'viewField') => {
    const existing = getByUniversalIdentifier(existingAllFlatEntityMaps, kind);
    const standard = getByUniversalIdentifier(standardAllFlatEntityMaps, kind);

    return retiredUniversalIdentifiers[kind].flatMap((universalIdentifier) => {
      const existingEntity = existing[universalIdentifier];

      // Listed + present + owned by the standard application, and not brought
      // back by the blueprint. Anything else is left alone.
      if (
        !isDefined(existingEntity) ||
        existingEntity.applicationUniversalIdentifier !==
          TWENTY_STANDARD_APPLICATION_UNIVERSAL_IDENTIFIER ||
        isDefined(standard[universalIdentifier])
      ) {
        return [];
      }

      return [existingEntity];
    });
  };

  return {
    fieldMetadata: findRetired(
      'fieldMetadata',
    ) as unknown as FlatFieldMetadata[],
    viewField: findRetired('viewField') as unknown as FlatViewField[],
  };
};

// Pure diff of the current standard blueprint (`standard`, the "to" side)
// against a workspace's existing metadata (`existing`, the "from" side). It is
// create-only apart from appending missing select option values and deleting
// the explicitly retired standard entities (allowlist, never inferred).
export const planStandardSchemaConvergence = ({
  standardAllFlatEntityMaps,
  existingAllFlatEntityMaps,
  now,
  retiredUniversalIdentifiers = CONVERGE_RETIRED_STANDARD_UNIVERSAL_IDENTIFIERS,
}: {
  standardAllFlatEntityMaps: ConvergeFlatEntityMaps;
  existingAllFlatEntityMaps: ConvergeFlatEntityMaps;
  now: string;
  retiredUniversalIdentifiers?: ConvergeRetiredUniversalIdentifiers;
}): StandardSchemaConvergencePlan => {
  const plannedByMetadataName = new Map<
    ConvergeCreatableMetadataName,
    Map<string, AnyFlatEntity>
  >();
  const skippedByMetadataName = new Map<string, Set<string>>();
  const skippedDependents: Partial<
    Record<ConvergeCreatableMetadataName, number>
  > = {};

  const markSkipped = (metadataName: string, universalIdentifier: string) => {
    const skipped = skippedByMetadataName.get(metadataName) ?? new Set();

    skipped.add(universalIdentifier);
    skippedByMetadataName.set(metadataName, skipped);
  };

  for (const metadataName of CONVERGE_CREATABLE_METADATA_NAMES) {
    const existing = getByUniversalIdentifier(
      existingAllFlatEntityMaps,
      metadataName,
    );
    const missing = new Map<string, AnyFlatEntity>();

    for (const standardEntity of Object.values(
      getByUniversalIdentifier(standardAllFlatEntityMaps, metadataName),
    )) {
      if (
        isDefined(standardEntity) &&
        !isDefined(existing[standardEntity.universalIdentifier])
      ) {
        missing.set(standardEntity.universalIdentifier, standardEntity);
      }
    }

    plannedByMetadataName.set(metadataName, missing);
  }

  const existingObjects = Object.values(
    existingAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier,
  ).filter(isDefined);
  const existingFields = Object.values(
    existingAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
  ).filter(isDefined);

  const getObjectName = (objectUniversalIdentifier: string): string =>
    existingAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      objectUniversalIdentifier
    ]?.nameSingular ??
    standardAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
      objectUniversalIdentifier
    ]?.nameSingular ??
    objectUniversalIdentifier;

  // Object CONFLICT: a missing standard object whose name is already taken by
  // another object. Its subtree can't be created without renaming user data.
  const conflicts: StandardSchemaConflictEntry[] = [];
  const plannedObjects = plannedByMetadataName.get('objectMetadata')!;

  for (const plannedObject of [
    ...plannedObjects.values(),
  ] as unknown as FlatObjectMetadata[]) {
    const plannedNames = [plannedObject.nameSingular, plannedObject.namePlural];
    const collidingObject = existingObjects.find(
      (existingObject) =>
        existingObject.universalIdentifier !==
          plannedObject.universalIdentifier &&
        (plannedNames.includes(existingObject.nameSingular) ||
          plannedNames.includes(existingObject.namePlural)),
    );

    if (!isDefined(collidingObject)) {
      continue;
    }

    conflicts.push({
      kind: 'objectMetadata',
      universalIdentifier: plannedObject.universalIdentifier,
      name: plannedObject.nameSingular,
      existingUniversalIdentifier: collidingObject.universalIdentifier,
    });
    plannedObjects.delete(plannedObject.universalIdentifier);
    markSkipped('objectMetadata', plannedObject.universalIdentifier);
  }

  // Field SHADOW: a missing standard field whose (object, name) is already
  // taken by a field with a different universalIdentifier. It is skipped and
  // reported; the existing field is left untouched.
  const shadowed: StandardSchemaShadowedEntry[] = [];
  const plannedFields = plannedByMetadataName.get('fieldMetadata')!;
  const existingFieldByObjectAndName = new Map(
    existingFields.map((existingField) => [
      `${existingField.objectMetadataUniversalIdentifier}:${existingField.name}`,
      existingField,
    ]),
  );

  for (const plannedField of [
    ...plannedFields.values(),
  ] as unknown as FlatFieldMetadata[]) {
    const shadowingField = existingFieldByObjectAndName.get(
      `${plannedField.objectMetadataUniversalIdentifier}:${plannedField.name}`,
    );

    if (!isDefined(shadowingField)) {
      continue;
    }

    shadowed.push({
      kind: 'fieldMetadata',
      universalIdentifier: plannedField.universalIdentifier,
      objectName: getObjectName(plannedField.objectMetadataUniversalIdentifier),
      name: plannedField.name,
      existingUniversalIdentifier: shadowingField.universalIdentifier,
    });
    plannedFields.delete(plannedField.universalIdentifier);
    markSkipped('fieldMetadata', plannedField.universalIdentifier);
  }

  // Slot SHADOW: DB unique keys the migration validator does not check. A
  // missing standard viewField whose (view, field) slot, searchFieldMetadata
  // whose (object, field) slot, or index whose (object, name) slot is already
  // taken by a live entity with another universalIdentifier (for example a
  // column the user or another app added) is skipped and reported, never
  // duplicated. The existing entity is left untouched.
  const slotShadowRules: {
    kind: 'viewField' | 'searchFieldMetadata' | 'index';
    slotKeys: [string, string];
    describe: (entity: AnyFlatEntity) => { objectName: string; name: string };
  }[] = [
    {
      kind: 'viewField',
      slotKeys: ['viewUniversalIdentifier', 'fieldMetadataUniversalIdentifier'],
      describe: (entity) => {
        const view =
          getByUniversalIdentifier(existingAllFlatEntityMaps, 'view')[
            entity.viewUniversalIdentifier as string
          ] ??
          getByUniversalIdentifier(standardAllFlatEntityMaps, 'view')[
            entity.viewUniversalIdentifier as string
          ];
        const field =
          existingAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
            entity.fieldMetadataUniversalIdentifier as string
          ] ??
          standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
            entity.fieldMetadataUniversalIdentifier as string
          ];

        return {
          objectName: `${String(view?.name ?? entity.viewUniversalIdentifier)}`,
          name: field?.name ?? String(entity.fieldMetadataUniversalIdentifier),
        };
      },
    },
    {
      kind: 'searchFieldMetadata',
      slotKeys: [
        'objectMetadataUniversalIdentifier',
        'fieldMetadataUniversalIdentifier',
      ],
      describe: (entity) => ({
        objectName: getObjectName(
          entity.objectMetadataUniversalIdentifier as string,
        ),
        name:
          standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier[
            entity.fieldMetadataUniversalIdentifier as string
          ]?.name ?? String(entity.fieldMetadataUniversalIdentifier),
      }),
    },
    {
      kind: 'index',
      slotKeys: ['objectMetadataUniversalIdentifier', 'name'],
      describe: (entity) => ({
        objectName: getObjectName(
          entity.objectMetadataUniversalIdentifier as string,
        ),
        name: String(entity.name),
      }),
    },
  ];

  for (const { kind, slotKeys, describe } of slotShadowRules) {
    const slotOf = (entity: AnyFlatEntity): string | undefined => {
      const [first, second] = slotKeys.map((key) => entity[key]);

      return typeof first === 'string' && typeof second === 'string'
        ? `${first}:${second}`
        : undefined;
    };
    const existingBySlot = new Map<string, AnyFlatEntity>();

    for (const existingEntity of Object.values(
      getByUniversalIdentifier(existingAllFlatEntityMaps, kind),
    )) {
      if (!isDefined(existingEntity) || isDefined(existingEntity.deletedAt)) {
        continue;
      }

      const slot = slotOf(existingEntity);

      if (isDefined(slot)) {
        existingBySlot.set(slot, existingEntity);
      }
    }

    const planned = plannedByMetadataName.get(kind)!;

    for (const [universalIdentifier, plannedEntity] of [...planned]) {
      const slot = slotOf(plannedEntity);
      const shadowingEntity = isDefined(slot)
        ? existingBySlot.get(slot)
        : undefined;

      if (!isDefined(shadowingEntity)) {
        continue;
      }

      shadowed.push({
        kind,
        universalIdentifier,
        ...describe(plannedEntity),
        existingUniversalIdentifier: shadowingEntity.universalIdentifier,
      });
      planned.delete(universalIdentifier);
      markSkipped(kind, universalIdentifier);
    }
  }

  // Dependency closure: drop every planned entity that references a skipped
  // entity, or a tracked entity that neither exists nor is planned. Repeat
  // until stable so chains (field -> relation partner -> viewField) resolve.
  let hasChanged = true;

  while (hasChanged) {
    hasChanged = false;

    for (const [metadataName, planned] of plannedByMetadataName) {
      for (const [universalIdentifier, entity] of planned) {
        const hasUnresolvableReference = getUniversalReferences(
          metadataName,
          entity,
        ).some((reference) => {
          if (
            skippedByMetadataName
              .get(reference.metadataName)
              ?.has(reference.universalIdentifier) === true
          ) {
            return true;
          }

          if (!isTrackedMetadataName(reference.metadataName)) {
            return false;
          }

          return (
            !isDefined(
              getByUniversalIdentifier(
                existingAllFlatEntityMaps,
                reference.metadataName,
              )[reference.universalIdentifier],
            ) &&
            plannedByMetadataName
              .get(reference.metadataName)
              ?.has(reference.universalIdentifier) !== true
          );
        });

        if (hasUnresolvableReference) {
          planned.delete(universalIdentifier);
          markSkipped(metadataName, universalIdentifier);
          skippedDependents[metadataName] =
            (skippedDependents[metadataName] ?? 0) + 1;
          hasChanged = true;
        }
      }
    }
  }

  // Navigation menu items converge like every other kind: a missing standard
  // item is created as soon as its target (object, view, folder) exists or is
  // planned, which the dependency closure above guarantees. This is what puts
  // a sidebar entry added to the blueprint in hindsight on older workspaces.
  // Removing a standard item deletes its row, so a removal is indistinguishable
  // from "never created" and the item comes back on the next convergence.
  // An object the workspace deactivated gets no entry.
  const plannedNavigationMenuItems =
    plannedByMetadataName.get('navigationMenuItem')!;

  for (const [universalIdentifier, navigationMenuItem] of [
    ...plannedNavigationMenuItems,
  ]) {
    const targetObjectUniversalIdentifier =
      navigationMenuItem.targetObjectMetadataUniversalIdentifier;

    if (
      typeof targetObjectUniversalIdentifier === 'string' &&
      existingAllFlatEntityMaps.flatObjectMetadataMaps.byUniversalIdentifier[
        targetObjectUniversalIdentifier
      ]?.isActive === false
    ) {
      plannedNavigationMenuItems.delete(universalIdentifier);
    }
  }

  const drift = computeStructuralDrift({
    standardAllFlatEntityMaps,
    existingAllFlatEntityMaps,
    shadowed,
    getObjectName,
  });
  const extra = computeStandardExtras({
    standardAllFlatEntityMaps,
    existingAllFlatEntityMaps,
    getObjectName,
  });

  const skippedKinds = Object.fromEntries(
    CONVERGE_NEVER_CREATED_METADATA_NAMES.map((metadataName) => {
      const existing = getByUniversalIdentifier(
        existingAllFlatEntityMaps,
        metadataName,
      );

      return [
        metadataName,
        Object.values(
          getByUniversalIdentifier(standardAllFlatEntityMaps, metadataName),
        ).filter(
          (standardEntity) =>
            isDefined(standardEntity) &&
            !isDefined(existing[standardEntity.universalIdentifier]),
        ).length,
      ];
    }),
  ) as Record<ConvergeNeverCreatedMetadataName, number>;

  const { fieldMetadataToUpdate, optionAdds } = computeSelectOptionAppends({
    standardFieldMetadatas: Object.values(
      standardAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    ).filter(isDefined),
    existingFieldMaps:
      existingAllFlatEntityMaps.flatFieldMetadataMaps.byUniversalIdentifier,
    now,
  });

  const toCreate = Object.fromEntries(
    CONVERGE_CREATABLE_METADATA_NAMES.map((metadataName) => [
      metadataName,
      [...plannedByMetadataName.get(metadataName)!.values()],
    ]),
  ) as unknown as StandardSchemaConvergencePlan['toCreate'];

  const toDelete = computeRetiredToDelete({
    standardAllFlatEntityMaps,
    existingAllFlatEntityMaps,
    retiredUniversalIdentifiers,
  });

  return {
    toCreate,
    toDelete,
    drift,
    extra,
    fieldMetadataToUpdate,
    optionAdds,
    shadowed,
    conflicts,
    skippedDependents,
    skippedKinds,
  };
};

export const countStandardSchemaConvergenceCreates = (
  toCreate: StandardSchemaConvergencePlan['toCreate'],
): Partial<Record<ConvergeCreatableMetadataName, number>> =>
  Object.fromEntries(
    Object.entries(toCreate)
      .filter(([, entities]) => entities.length > 0)
      .map(([metadataName, entities]) => [metadataName, entities.length]),
  );

export const countStandardSchemaConvergenceDeletes = (
  toDelete: StandardSchemaConvergencePlan['toDelete'],
): Partial<Record<keyof StandardSchemaConvergencePlan['toDelete'], number>> =>
  Object.fromEntries(
    Object.entries(toDelete)
      .filter(([, entities]) => entities.length > 0)
      .map(([metadataName, entities]) => [metadataName, entities.length]),
  );
