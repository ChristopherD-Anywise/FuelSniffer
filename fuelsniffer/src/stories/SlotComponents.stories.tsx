import type { Meta, StoryObj } from '@storybook/react'
import { SlotVerdict, SlotTrueCost, SlotShareButton, SlotAlertButton } from '@/components/slots'
import { mockStation } from './mockData'

// SlotVerdict
const verdictMeta: Meta<typeof SlotVerdict> = {
  title: 'Slots/SlotVerdict',
  component: SlotVerdict,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    a11y: { disable: false },
    docs: {
      description: {
        component: 'Reserved layout footprint for SP-4 verdict chips. Renders a 56×22 invisible pill; aria-hidden until SP-4 fills it.',
      },
    },
  },
}
export default verdictMeta
type VerdictStory = StoryObj<typeof SlotVerdict>

export const VerdictPlaceholder: VerdictStory = {
  name: 'SlotVerdict — placeholder',
  args: { station: mockStation },
}

// Inline stories for the other slots using a wrapper
export const TrueCostCard: StoryObj = {
  name: 'SlotTrueCost — card context',
  render: () => (
    <div style={{ background: 'var(--color-bg)', padding: '16px', color: 'var(--color-text)', fontFamily: 'sans-serif' }}>
      <p style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginBottom: '8px' }}>Card context — reserves 18px height</p>
      <SlotTrueCost station={mockStation} context="card" />
    </div>
  ),
}

export const TrueCostPopup: StoryObj = {
  name: 'SlotTrueCost — popup context (null)',
  render: () => (
    <div style={{ background: 'var(--color-bg)', padding: '16px', color: 'var(--color-text)', fontFamily: 'sans-serif' }}>
      <p style={{ fontSize: '12px', color: 'var(--color-text-subtle)', marginBottom: '8px' }}>Popup context — renders null (no space reserved)</p>
      <SlotTrueCost station={mockStation} context="popup" />
      <p style={{ fontSize: '11px', color: 'var(--color-text-subtle)' }}>(nothing rendered above)</p>
    </div>
  ),
}

export const ShareButton: StoryObj = {
  name: 'SlotShareButton — disabled',
  render: () => (
    <div style={{ background: 'var(--color-bg)', padding: '16px' }}>
      <SlotShareButton station={mockStation} />
    </div>
  ),
}

export const AlertButton: StoryObj = {
  name: 'SlotAlertButton — disabled',
  render: () => (
    <div style={{ background: 'var(--color-bg)', padding: '16px' }}>
      <SlotAlertButton station={mockStation} />
    </div>
  ),
}
