import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardComparableViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'comparable'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allComparablesName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'comparable',
      context: {
        viewName: 'allComparables',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 200,
      },
    }),
    allComparablesCreatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'comparable',
      context: {
        viewName: 'allComparables',
        viewFieldName: 'createdBy',
        fieldName: 'createdBy',
        position: 1,
        isVisible: true,
        size: 150,
      },
    }),
    allComparablesCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'comparable',
      context: {
        viewName: 'allComparables',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 2,
        isVisible: true,
        size: 150,
      },
    }),
    allComparablesUpdatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'comparable',
      context: {
        viewName: 'allComparables',
        viewFieldName: 'updatedAt',
        fieldName: 'updatedAt',
        position: 3,
        isVisible: true,
        size: 150,
      },
    }),
    allComparablesUpdatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'comparable',
      context: {
        viewName: 'allComparables',
        viewFieldName: 'updatedBy',
        fieldName: 'updatedBy',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
