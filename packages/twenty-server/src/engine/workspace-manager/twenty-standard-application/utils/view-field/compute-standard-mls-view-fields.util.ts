import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardMlsViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'mls'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allMlsesName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'mls',
      context: {
        viewName: 'allMlses',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 200,
      },
    }),
    allMlsesLoginUrl: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'mls',
      context: {
        viewName: 'allMlses',
        viewFieldName: 'loginUrl',
        fieldName: 'loginUrl',
        position: 1,
        isVisible: true,
        size: 250,
      },
    }),
    allMlsesIsDefault: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'mls',
      context: {
        viewName: 'allMlses',
        viewFieldName: 'isDefault',
        fieldName: 'isDefault',
        position: 2,
        isVisible: true,
        size: 100,
      },
    }),
    allMlsesCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'mls',
      context: {
        viewName: 'allMlses',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 3,
        isVisible: true,
        size: 150,
      },
    }),
    allMlsesUpdatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'mls',
      context: {
        viewName: 'allMlses',
        viewFieldName: 'updatedAt',
        fieldName: 'updatedAt',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
