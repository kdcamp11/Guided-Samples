// Phase-specific prompt templates — minimal, fixed context per phase.
// Each function takes only the parameters its phase needs.

export type LogoParams = {
  userPrompt: string
  hasReference: boolean
}

export type GarmentParams = {
  userPrompt: string
  garmentType: string
  color: string
  hasReference: boolean
}

export type PreviewParams = {
  garmentType: string
  garmentColor: string
  logoStyle: string
  logoColor: string
  placement: string
}

export const logoPrompt = ({ userPrompt, hasReference }: LogoParams): string =>
  hasReference
    ? `You are given a reference logo image. Reproduce its exact font style, exact letter shapes, exact colors, and exact graphic elements. Do not change the typeface, stroke style, or color palette. Apply only this layout change: ${userPrompt}. Transparent background, no shadow, no new colors introduced.`
    : `Professional vector-style brand logo. ${userPrompt}. Clean, minimal, high-contrast, centered composition, flat design. Transparent background, no shadow.`

export const garmentPrompt = ({ userPrompt, garmentType, color, hasReference }: GarmentParams): string =>
  hasReference
    ? `Use the uploaded image as a garment style reference. Flat-lay ${color} ${garmentType}. ${userPrompt}. No model, no text, no logo. Studio shot, transparent background, realistic fabric texture.`
    : `Professional flat-lay ${color} ${garmentType}. ${userPrompt}. Front view, centered. No model, no text, no logo. Transparent background, soft fabric shadows.`

export const previewPrompt = ({ garmentType, garmentColor, logoStyle, logoColor, placement }: PreviewParams): string =>
  `Professional apparel product photography. ${garmentColor} ${garmentType} with a ${logoStyle} logo in ${logoColor} at the ${placement}. Studio lighting, white background, photorealistic, no model.`
