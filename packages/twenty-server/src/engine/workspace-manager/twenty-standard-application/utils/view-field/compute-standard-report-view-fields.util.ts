import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardReportViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'report'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allReportsName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'report',
      context: {
        viewName: 'allReports',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 200,
      },
    }),
    allReportsCreatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'report',
      context: {
        viewName: 'allReports',
        viewFieldName: 'createdBy',
        fieldName: 'createdBy',
        position: 1,
        isVisible: true,
        size: 150,
      },
    }),
    allReportsCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'report',
      context: {
        viewName: 'allReports',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 2,
        isVisible: true,
        size: 150,
      },
    }),
    allReportsUpdatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'report',
      context: {
        viewName: 'allReports',
        viewFieldName: 'updatedAt',
        fieldName: 'updatedAt',
        position: 3,
        isVisible: true,
        size: 150,
      },
    }),
    allReportsUpdatedBy: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'report',
      context: {
        viewName: 'allReports',
        viewFieldName: 'updatedBy',
        fieldName: 'updatedBy',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
