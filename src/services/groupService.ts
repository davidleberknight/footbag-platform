import { PageViewModel } from '../types/page';

interface GroupsContent {}

export const groupService = {
  /** GET /groups */
  getIndexPage(): PageViewModel<GroupsContent> {
    return {
      seo: { title: 'Groups', noindex: true },
      page: {
        sectionKey: 'groups',
        pageKey: 'groups_index',
        title: 'Groups',
      },
      content: {},
    };
  },
};
