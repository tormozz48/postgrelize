import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
// oxlint-disable-next-line import/no-unassigned-import -- VitePress theme CSS is a side-effect import
import './custom.css';
import Ext from './Ext.vue';

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Ext', Ext);
  },
};

// oxlint-disable-next-line import/no-default-export -- VitePress requires a default theme export
export default theme;
