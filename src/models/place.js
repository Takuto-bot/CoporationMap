export const PLACE_TYPES = {
  company: {
    id: "company",
    label: "企業",
    iconName: "company",
  },
  government: {
    id: "government",
    label: "官公庁",
    iconName: "government",
  },
};

export const TYPE_META = Object.values(PLACE_TYPES);

export const FILTERS = [
  { id: "all", kind: "type", label: "すべて", iconName: "map" },
  { id: "company", kind: "type", label: "企業", iconName: "company" },
  { id: "government", kind: "type", label: "官公庁", iconName: "government" },
  { id: "headquartersOnly", kind: "flag", label: "本社のみ", iconName: "headquarters" },
];

export function getTypeMeta(type) {
  return PLACE_TYPES[type] || PLACE_TYPES.company;
}

/**
 * @typedef {Object} Place
 * @property {string} id
 * @property {string} name
 * @property {"company" | "government"} type
 * @property {string} category
 * @property {string} address
 * @property {number} latitude
 * @property {number} longitude
 * @property {string=} website
 * @property {string=} description
 * @property {string} source
 * @property {boolean=} headquarters
 * @property {string=} corporateNumber
 * @property {string=} stockCode
 * @property {string=} capital
 * @property {string=} employees
 */
