import { describe, expect, it } from 'vitest'
import { installAppKitLabelOverrides } from '@/components/appkit-label-overrides'

describe('appkit-label-overrides', () => {
  it('renames Reown connect button defaults to Connect', async () => {
    installAppKitLabelOverrides()

    if (!customElements.get('w3m-connect-button')) {
      class W3mConnectButton extends HTMLElement {
        #label = ''

        get label() {
          return this.#label
        }

        set label(value: string) {
          this.#label = value
        }
      }

      customElements.define('w3m-connect-button', W3mConnectButton)
    }

    await customElements.whenDefined('w3m-connect-button')
    const element = document.createElement('w3m-connect-button') as HTMLElement & {
      label: string
    }

    element.label = 'Connect Wallet'
    expect(element.label).toBe('Connect')
  })

  it('renames the Reown modal connect header to Connect', async () => {
    installAppKitLabelOverrides()

    if (!customElements.get('w3m-header')) {
      class W3mHeader extends HTMLElement {
        heading = 'Connect Wallet'

        titleTemplate() {
          return this.heading
        }
      }

      customElements.define('w3m-header', W3mHeader)
    }

    await customElements.whenDefined('w3m-header')
    const element = document.createElement('w3m-header') as HTMLElement & {
      heading: string
      titleTemplate: () => string
    }

    element.heading = 'Connect Wallet'
    expect(element.titleTemplate()).toBe('Connect')

    element.heading = 'Connect Email Wallet'
    expect(element.titleTemplate()).toBe('Connect')
  })
})
