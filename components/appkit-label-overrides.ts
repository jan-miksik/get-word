'use client'

type PatchableElementConstructor = CustomElementConstructor & {
  prototype: {
    label?: string
    loadingLabel?: string
    heading?: string
    titleTemplate?: (...args: unknown[]) => unknown
  }
}

type PatchedTemplateFunction = ((...args: unknown[]) => unknown) & {
  __getWordLabelOverride?: boolean
}

const CONNECT_WALLET_LABEL_PATTERN = /^Connect\s+(Email\s+)?Wallet$/i

function normalizeConnectLabel(label: unknown) {
  return typeof label === 'string' && CONNECT_WALLET_LABEL_PATTERN.test(label.trim())
    ? 'Connect'
    : label
}

function patchConnectButtonLabel(tagName: string) {
  void customElements.whenDefined(tagName).then(() => {
    const element = customElements.get(tagName) as PatchableElementConstructor | undefined
    if (!element?.prototype) {
      return
    }

    const descriptor = Object.getOwnPropertyDescriptor(element.prototype, 'label')
    if (!descriptor?.set || !descriptor.get) {
      return
    }

    Object.defineProperty(element.prototype, 'label', {
      ...descriptor,
      set(value: string) {
        descriptor.set?.call(this, normalizeConnectLabel(value))
      },
    })
  })
}

function patchHeaderTitle() {
  void customElements.whenDefined('w3m-header').then(() => {
    const element = customElements.get('w3m-header') as PatchableElementConstructor | undefined
    if (!element?.prototype) {
      return
    }

    const titleTemplate = element?.prototype.titleTemplate as
      | PatchedTemplateFunction
      | undefined
    if (!titleTemplate || titleTemplate.__getWordLabelOverride) {
      return
    }

    const patchedTitleTemplate = function (
      this: PatchableElementConstructor['prototype'],
      ...args: unknown[]
    ) {
      this.heading = normalizeConnectLabel(this.heading) as string | undefined
      return titleTemplate.apply(this, args)
    }
    patchedTitleTemplate.__getWordLabelOverride = true

    element.prototype.titleTemplate = patchedTitleTemplate
  })
}

export function installAppKitLabelOverrides() {
  if (typeof window === 'undefined' || !window.customElements) {
    return
  }

  patchConnectButtonLabel('w3m-connect-button')
  patchConnectButtonLabel('appkit-connect-button')
  patchHeaderTitle()
}
