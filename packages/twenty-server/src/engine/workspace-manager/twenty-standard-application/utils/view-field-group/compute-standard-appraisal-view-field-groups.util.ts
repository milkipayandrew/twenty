import { type FlatViewFieldGroup } from 'src/engine/metadata-modules/flat-view-field-group/types/flat-view-field-group.type';
import {
  createStandardViewFieldGroupFlatMetadata,
  type CreateStandardViewFieldGroupArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view-field-group/create-standard-view-field-group-flat-metadata.util';

export const computeStandardAppraisalViewFieldGroups = (
  args: Omit<CreateStandardViewFieldGroupArgs<'appraisal'>, 'context'>,
): Record<string, FlatViewFieldGroup> => {
  return {
    appraisalRecordPageFieldsGeneral: createStandardViewFieldGroupFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'appraisalRecordPageFields',
        viewFieldGroupName: 'general',
        name: 'General',
        position: 0,
        isVisible: true,
      },
    }),
    appraisalRecordPageFieldsRelations:
      createStandardViewFieldGroupFlatMetadata({
        ...args,
        objectName: 'appraisal',
        context: {
          viewName: 'appraisalRecordPageFields',
          viewFieldGroupName: 'relations',
          name: 'Relations',
          position: 1,
          isVisible: true,
        },
      }),
    appraisalRecordPageFieldsSubject: createStandardViewFieldGroupFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'appraisalRecordPageFields',
        viewFieldGroupName: 'subject',
        name: 'Subject',
        position: 2,
        isVisible: true,
      },
    }),
    appraisalRecordPageFieldsSystem: createStandardViewFieldGroupFlatMetadata({
      ...args,
      objectName: 'appraisal',
      context: {
        viewName: 'appraisalRecordPageFields',
        viewFieldGroupName: 'system',
        name: 'System',
        position: 3,
        isVisible: true,
      },
    }),
  };
};
