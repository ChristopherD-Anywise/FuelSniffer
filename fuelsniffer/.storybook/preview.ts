import type { Preview } from '@storybook/react'
import '../src/app/globals.css'
import '../src/styles/tokens.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // Axe configuration for accessibility checks
      config: {
        rules: [
          {
            // color-contrast is checked at the component level
            id: 'color-contrast',
            enabled: true,
          },
        ],
      },
    },
  },
  globalTypes: {
    theme: {
      description: 'Global theme',
      defaultValue: 'dark',
      toolbar: {
        title: 'Theme',
        icon: 'circlehollow',
        items: ['light', 'dark'],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals?.theme ?? 'dark'
      document.documentElement.setAttribute('data-theme', theme)
      return Story()
    },
  ],
}

export default preview
