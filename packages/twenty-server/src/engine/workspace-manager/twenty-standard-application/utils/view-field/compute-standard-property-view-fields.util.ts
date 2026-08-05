import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardPropertyViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'property'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allPropertiesName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'property',
      context: {
        viewName: 'allProperties',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 200,
      },
    }),
    allPropertiesCreatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'property',
      context: {
        viewName: 'allProperties',
        viewFieldName: 'createdBy',
        fieldName: 'createdBy',
        position: 1,
        isVisible: true,
        size: 150,
      },
    }),
    allPropertiesCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'property',
      context: {
        viewName: 'allProperties',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 2,
        isVisible: true,
        size: 150,
      },
    }),
    allPropertiesUpdatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'property',
      context: {
        viewName: 'allProperties',
        viewFieldName: 'updatedAt',
        fieldName: 'updatedAt',
        position: 3,
        isVisible: true,
        size: 150,
      },
    }),
    allPropertiesUpdatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'property',
      context: {
        viewName: 'allProperties',
        viewFieldName: 'updatedBy',
        fieldName: 'updatedBy',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
    allPropertiesPhotos: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'property',
      context: {
        viewName: 'allProperties',
        viewFieldName: 'photos',
        fieldName: 'photos',
        position: 5,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
