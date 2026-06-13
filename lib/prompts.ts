// Phase-specific prompt templates

export type LogoParams = {
  userPrompt: string
  hasReference: boolean
}

export type GarmentParams = {
  userPrompt: string
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

export const logoPrompt = ({ userPrompt, hasReference }: LogoParams): string => {
  const base = `You are a senior brand identity designer specializing in contemporary apparel brands.

Create an original logo system based on the user's request.

The logo should feel commercially viable and professionally designed, as if developed by a leading branding agency for an established fashion label.

Prioritize:
• Simplicity and memorability
• Strong silhouette recognition
• Typography that reflects the brand personality
• Scalability across embroidery, screen printing, woven labels, hangtags, packaging, and digital use
• Balanced proportions and thoughtful use of negative space

Avoid:
• Generic AI aesthetics
• Excessive gradients
• Overly ornate details
• Clip-art styling
• Obvious religious clichés unless specifically requested

Output only the logo artwork on a transparent background with crisp, vector-inspired edges.

Brand Direction:
${userPrompt}`

  return hasReference
    ? `Use the uploaded image as a visual style reference. ${base}`
    : base
}

export const garmentPrompt = ({ userPrompt, hasReference, view = 'front' }: GarmentParams): string => {
  const viewAngle = view === 'back' ? 'back view' : view === 'side' ? 'side view' : 'front view'

  const consistencyPrefix = hasReference
    ? `This is the EXACT same garment shown from a different angle. Every detail must remain completely identical: color, fabric weight, silhouette, collar construction, sleeve shape, ribbing, pockets, stitching, hems, and all construction details. Only the camera angle changes. Show the ${viewAngle}.`
    : ''

  return [
    consistencyPrefix,
    `You are a senior apparel designer and product developer creating premium blank garments for modern fashion brands.`,
    `Generate a highly realistic garment concept based on the user's specifications.`,
    `The garment should appear as if it has been professionally photographed as a development sample for a premium apparel collection.`,
    ``,
    `Design priorities:`,
    `• Prioritize manufacturing realism and construction accuracy.`,
    `• Ensure the garment could realistically be produced by an apparel supplier.`,
    `• Focus on silhouette, fit, proportion, and textile authenticity.`,
    `• Preserve believable seam placement, collar construction, paneling, and finishing details.`,
    `• Reflect the specified fabric weight through realistic drape and structure.`,
    `• Avoid exaggerated proportions or stylized details that feel artificial.`,
    ``,
    `Photography direction:`,
    `• Premium commercial product photography aesthetic.`,
    `• Centered ${viewAngle} presentation.`,
    `• Clean, unobtrusive studio background.`,
    `• Soft natural studio lighting.`,
    `• Subtle grounding shadows.`,
    `• No model. No mannequin. No props. No branding unless explicitly requested.`,
    ``,
    `Material realism:`,
    `• Show authentic fabric texture appropriate to the specified material.`,
    `• Include realistic stitching and construction details.`,
    `• Depict natural folds and tension points where appropriate.`,
    `• Preserve the visual weight and structure associated with the stated GSM.`,
    ``,
    `The final image should resemble an actual garment photographed for a high-end e-commerce product launch, rather than a digital rendering or fashion illustration.`,
    ``,
    `Garment Specifications:`,
    userPrompt,
  ].filter(s => s !== undefined).join('\n')
}

export const previewPrompt = ({ garmentType, garmentColor, logoStyle, logoColor, placement }: PreviewParams): string =>
  `Professional apparel product photography. ${garmentColor} ${garmentType} with a ${logoStyle} logo in ${logoColor} at the ${placement}. Studio lighting, white background, photorealistic, no model.`
