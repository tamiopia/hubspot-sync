import { extensions } from '@wix/astro/builders';

export default extensions.dashboardPage({
  id: '4172c294-22ad-40cc-8c58-531d3c57048e',
  title: 'My Page',
  routePath: '',
  component: './extensions/dashboard/pages/my-page/my-page.tsx',
  fullPage: false,
  metaData: {
    searchable: true,
    description: 'Manage My Page in your dashboard.',
  },
});
