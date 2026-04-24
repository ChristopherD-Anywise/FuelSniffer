import type { Meta, StoryObj } from '@storybook/react'
import StationDetail from '@/components/StationDetail'
import { mockStation, mockStationExpensive, mockStationFlat } from './mockData'

const meta: Meta<typeof StationDetail> = {
  title: 'Components/StationDetail',
  component: StationDetail,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    a11y: { disable: false },
  },
  args: {
    fuelId: '2',
    allStations: [mockStation, mockStationExpensive, mockStationFlat],
    onClose: () => {},
    onFuelChange: () => {},
  },
}

export default meta
type Story = StoryObj<typeof StationDetail>

export const Default: Story = {
  args: {
    station: mockStation,
  },
}

export const PriceUp: Story = {
  args: {
    station: mockStationExpensive,
  },
}
