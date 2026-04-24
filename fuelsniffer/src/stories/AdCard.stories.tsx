import type { Meta, StoryObj } from '@storybook/react'
import AdCard from '@/components/AdCard'

const meta: Meta<typeof AdCard> = {
  title: 'Components/AdCard',
  component: AdCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    a11y: { disable: false },
  },
}

export default meta
type Story = StoryObj<typeof AdCard>

export const Placeholder: Story = {}
