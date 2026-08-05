import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardAppraisalViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'appraisal'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allAppraisalsName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'allAppraisals',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 200,
      },
    }),
    allAppraisalsStatus: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'allAppraisals',
        viewFieldName: 'status',
        fieldName: 'status',
        position: 1,
        isVisible: true,
        size: 150,
      },
    }),
    allAppraisalsFlowState: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'allAppraisals',
        viewFieldName: 'flowState',
        fieldName: 'flowState',
        position: 2,
        isVisible: true,
        size: 150,
      },
    }),
    allAppraisalsCreatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'allAppraisals',
        viewFieldName: 'createdBy',
        fieldName: 'createdBy',
        position: 3,
        isVisible: true,
        size: 150,
      },
    }),
    allAppraisalsCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'allAppraisals',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
    allAppraisalsUpdatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'allAppraisals',
        viewFieldName: 'updatedAt',
        fieldName: 'updatedAt',
        position: 5,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
