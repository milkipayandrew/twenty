import { ViewKey, ViewType } from 'twenty-shared/types';

import { type FlatView } from 'src/engine/metadata-modules/flat-view/types/flat-view.type';
import {
  createStandardViewFlatMetadata,
  type CreateStandardViewArgs,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/view/create-standard-view-flat-metadata.util';

export const computeStandardMlsViews = (
  args: Omit<CreateStandardViewArgs<'mls'>, 'context'>,
): Record<string, FlatView> => {
  return {
    allMlses: createStandardViewFlatMetadata({
      ...args,
      objectName: 'mls',
      context: {
        viewName: 'allMlses',
        name: 'All {objectLabelPlural}',
        type: ViewType.TABLE,
        key: ViewKey.INDEX,
        position: 0,
        icon: 'IconList',
      },
    }),
  };
};
