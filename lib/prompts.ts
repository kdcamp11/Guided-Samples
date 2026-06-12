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
  view?: string
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
    ? `Use the uploaded image as a visual style reference. Professional vector-style brand logo. ${userPrompt}. Clean, minimal, high-contrast, centered, flat design. Transparent background, no shadow.`
    : `Professional vector-style brand logo. ${userPrompt}. Clean, minimal, high-contrast, centered composition, flat design. Transparent background, no shadow.`

export const garmentPrompt = ({ userPrompt, hasReference, view = 'front' }: GarmentParams): string => {
  const viewAngle = view === 'back' ? 'back view' : view === 'side' ? 'side view' : 'front view'
  const base = `${viewAngle}. ${userPrompt}. No model, no text, no logo, no background. Transparent background, realistic fabric texture, studio lighting.`
  return hasReference
    ? `This is the same garment shown from a different angle. Keep identical color, silhouette, fabric, collar, sleeves, fit, and construction details. Show the ${viewAngle}. ${base}`
    : `Professional product shot of a blank garment. ${base}`
}

export const previewPrompt = ({ garmentType, garmentColor, logoStyle, logoColor, placement }: PreviewParams): string =>
  `Professional apparel product photography. ${garmentColor} ${garmentType} with a ${logoStyle} logo in ${logoColor} at the ${placement}. Studio lighting, white background, photorealistic, no model.`
