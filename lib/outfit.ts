import type { Profile } from './types';

export type OutfitId = 'none' | 'hardhat' | 'medical' | 'mechanic' | 'stylist' | 'chef' | 'realtor' | 'coach' | 'shop';

export const OUTFIT_LABEL: Record<OutfitId, string> = {
  none: '', hardhat: 'a hard hat', medical: 'scrubs and a mask', mechanic: 'a shop cap',
  stylist: 'my good scissors', chef: 'a chef hat', realtor: 'a bow tie', coach: 'a sweatband', shop: 'an apron',
};

const MEDICAL = /\b(dental|dentist(ry)?|orthodont\w*|clinic|medical|healthcare|health center|doctors?|physiotherap\w*|physical therapy|chiropract\w*|veterinar\w*|pediatric\w*|dermatolog\w*|optometr\w*|eye care|urgent care|family practice)\b/i;

/** Picks the outfit Pip wears while presenting a business. The industry decides; medical words
 *  only matter when the industry is unknown. */
export function outfitFor(p: Pick<Profile, 'name' | 'industry' | 'site' | 'desc' | 'services'> | null | undefined): OutfitId {
  if (!p) return 'none';
  const text = [p.name, p.site, p.desc, ...(p.services || [])].filter(Boolean).join(' ');
  if (p.industry === 'other' && MEDICAL.test(text)) return 'medical';
  switch (p.industry) {
    case 'home': return 'hardhat';
    case 'health': return 'medical';
    case 'auto': return 'mechanic';
    case 'salon': return 'stylist';
    case 'restaurant': return 'chef';
    case 'realestate': return 'realtor';
    case 'fitness': return 'coach';
    case 'retail': return 'shop';
    default: return 'none';
  }
}
