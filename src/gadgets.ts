/** Ground-only pocket relics. G collects, X uses; charges are owned by the host. */
export const GADGETS = {
 nuke:{name:'Rift Nuke',short:'Nuke',description:'Unlocks when anyone reaches 10 eliminations. A 3-second warning, then a 26m blast. Only recent damage can earn kill credit.',charges:1,color:0xffc247},
 ice_wand:{name:'Ice Spray Wand',short:'Ice Spray',description:'Freeze the pace. Slow opponents in a 12m cone for 3 seconds. Two sprays.',charges:2,color:0x91eeff},
 bonzo_staff:{name:'Bonzo Staff',short:'Bonzo',description:'Fire three bouncing balloons. Each explodes into confetti and damages everyone nearby, including you.',charges:3,color:0xff78b2},
 swap_pearl:{name:'Swap Pearl',short:'Swap Pearl',description:'Aim at a visible opponent within 28m and trade places. A missed swap keeps the pearl.',charges:1,color:0xc59aff},
 gravity_orb:{name:'Gravity Orb',short:'Gravity',description:'Place a vortex ahead of you. It pulls nearby opponents for 5 seconds.',charges:1,color:0x867cff},
 healing_totem:{name:'Healing Totem',short:'Totem',description:'Plant a healing zone for 8 seconds. Anyone inside can recover, including rivals.',charges:1,color:0x8aefa2},
 rocket_boots:{name:'Rocket Jump',short:'Rocket Jump',description:'Launch skyward and knock nearby rivals away. Two launches; no self-damage.',charges:2,color:0xffbc62},
} as const;
export type GadgetId=keyof typeof GADGETS;
export const GADGET_IDS=Object.keys(GADGETS) as GadgetId[];
export function isGadget(value:string):value is GadgetId{return Object.prototype.hasOwnProperty.call(GADGETS,value);}
