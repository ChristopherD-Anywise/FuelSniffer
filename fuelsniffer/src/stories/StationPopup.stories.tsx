import type { Meta, StoryObj } from '@storybook/react'
import StationPopup from '@/components/StationPopup'
import { mockStation, mockStationExpensive } from './mockData'

const meta: Meta<typeof StationPopup> = {
  title: 'Components/StationPopup',
  component: StationPopup,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    a11y: { disable: false },
  },
}

export default meta
type Story = StoryObj<typeof StationPopup>

export const Default: Story = {
  args: {
    station: mockStation,
    fuelId: '2',
  },
}

export const PriceUp: Story = {
  args: {
    station: mockStationExpensive,
    fuelId: '2',
  },
}
