import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardCompsearchViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'compsearch'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allCompsearchesName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'compsearch',
      context: {
        viewName: 'allCompsearches',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 200,
      },
    }),
    allCompsearchesCreatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'compsearch',
      context: {
        viewName: 'allCompsearches',
        viewFieldName: 'createdBy',
        fieldName: 'createdBy',
        position: 1,
        isVisible: true,
        size: 150,
      },
    }),
    allCompsearchesCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'compsearch',
      context: {
        viewName: 'allCompsearches',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 2,
        isVisible: true,
        size: 150,
      },
    }),
    allCompsearchesUpdatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'compsearch',
      context: {
        viewName: 'allCompsearches',
        viewFieldName: 'updatedAt',
        fieldName: 'updatedAt',
        position: 3,
        isVisible: true,
        size: 150,
      },
    }),
    allCompsearchesUpdatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'compsearch',
      context: {
        viewName: 'allCompsearches',
        viewFieldName: 'updatedBy',
        fieldName: 'updatedBy',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
