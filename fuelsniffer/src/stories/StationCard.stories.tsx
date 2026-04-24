import type { Meta, StoryObj } from '@storybook/react'
import StationCard from '@/components/StationCard'
import { mockStation, mockStationExpensive, mockStationFlat } from './mockData'

const meta: Meta<typeof StationCard> = {
  title: 'Components/StationCard',
  component: StationCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { disable: false },
  },
  args: {
    onClick: () => {},
    isSelected: false,
    rank: 1,
  },
}

export default meta
type Story = StoryObj<typeof StationCard>

export const Cheapest: Story = {
  args: {
    station: mockStation,
    rank: 1,
  },
}

export const Selected: Story = {
  args: {
    station: mockStation,
    rank: 1,
    isSelected: true,
  },
}

export const PriceUp: Story = {
  args: {
    station: mockStationExpensive,
    rank: 2,
  },
}

export const NoChange: Story = {
  args: {
    station: mockStationFlat,
    rank: 3,
  },
}
