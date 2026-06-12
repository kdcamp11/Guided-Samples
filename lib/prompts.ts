// Phase-specific prompt templates — minimal, fixed context per phase.

export type LogoParams = {
  userPrompt: string
  hasReference: boolean
}

export type GarmentParams = {
  userPrompt: string
  hasReference: boolean
  view?: string
  quality?: 'clean' | 'realistic'
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

export const garmentPrompt = ({ userPrompt, hasReference, view = 'front', quality = 'clean' }: GarmentParams): string => {
  const viewAngle = view === 'back' ? 'back view' : view === 'side' ? 'side view' : 'front view'

  const consistencyPrefix = hasReference
    ? `This is the EXACT same garment shown from a different angle. Every detail must remain completely identical: color, fabric weight, silhouette, collar construction, sleeve shape, ribbing, pockets, stitching, hems, and all construction details. Only the camera angle changes. Show the ${viewAngle}.`
    : ''

  if (quality === 'realistic') {
    return [
      consistencyPrefix,
      `Premium ecommerce studio product photography, ${viewAngle} of a blank ${userPrompt}.`,
      `Ghost mannequin or flat lay presentation.`,
      `Realistic fabric texture showing actual weight and drape. Natural folds and wrinkles from fabric weight.`,
      `Visible stitching, seam construction, accurate ribbing and trim details.`,
      `Subtle shadows and depth. Soft diffused studio lighting. Clean white background.`,
      `Photorealistic — looks like a real product photo, not illustrated or AI-generated.`,
      `No model, no text, no logo, no graphics.`,
    ].filter(Boolean).join(' ')
  }

  // clean / product view
  return [
    consistencyPrefix,
    `Professional clean product photography, ${viewAngle} of a blank ${userPrompt}.`,
    `Ghost mannequin or flat lay. Pure white background, even studio lighting, sharp focus.`,
    `Show fabric construction, seams, and details clearly.`,
    `No model, no text, no logo, no graphics.`,
  ].filter(Boolean).join(' ')
}

export const previewPrompt = ({ garmentType, garmentColor, logoStyle, logoColor, placement }: PreviewParams): string =>
  `Professional apparel product photography. ${garmentColor} ${garmentType} with a ${logoStyle} logo in ${logoColor} at the ${placement}. Studio lighting, white background, photorealistic, no model.`
