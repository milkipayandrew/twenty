import { type FlatViewField } from 'src/engine/metadata-modules/flat-view-field/types/flat-view-field.type';
import {
  createStandardViewFieldFlatMetadata,
  type CreateStandardViewFieldArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field/create-standard-view-field-flat-metadata.util';

export const computeStandardPipelineConfigViewFields = (
  args: Omit<CreateStandardViewFieldArgs<'pipelineConfig'>, 'context'>,
): Record<string, FlatViewField> => {
  return {
    allPipelineConfigsName: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'pipelineConfig',
      context: {
        viewName: 'allPipelineConfigs',
        viewFieldName: 'name',
        fieldName: 'name',
        position: 0,
        isVisible: true,
        size: 200,
      },
    }),
    allPipelineConfigsDebug: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'pipelineConfig',
      context: {
        viewName: 'allPipelineConfigs',
        viewFieldName: 'debug',
        fieldName: 'debug',
        position: 1,
        isVisible: true,
        size: 150,
      },
    }),
    allPipelineConfigsAdvanceOnComplete: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'pipelineConfig',
      context: {
        viewName: 'allPipelineConfigs',
        viewFieldName: 'advanceOnComplete',
        fieldName: 'advanceOnComplete',
        position: 2,
        isVisible: true,
        size: 150,
      },
    }),
    allPipelineConfigsCreatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'pipelineConfig',
      context: {
        viewName: 'allPipelineConfigs',
        viewFieldName: 'createdAt',
        fieldName: 'createdAt',
        position: 3,
        isVisible: true,
        size: 150,
      },
    }),
    allPipelineConfigsUpdatedAt: createStandardViewFieldFlatMetadata({
      ...args,
      objectName: 'pipelineConfig',
      context: {
        viewName: 'allPipelineConfigs',
        viewFieldName: 'updatedAt',
        fieldName: 'updatedAt',
        position: 4,
        isVisible: true,
        size: 150,
      },
    }),
  };
};
