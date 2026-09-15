/** Fixed details for the society and the project management consultant. */

export const SOCIETY = {
  name: "Ganpati Co-operative Housing Society Ltd.",
  shortName: "Ganpati CHS",
  address: "Sector 19, Nerul, Navi Mumbai",
} as const;

export const PMC = {
  name: "Sankalp Project Management Consultants Pvt. Ltd.",
  shortName: "Sankalp PMC",
  address: "1105 Ellora Fiesta, Sector 11, Sanpada, Navi Mumbai 400705",
  // TODO: replace with the committee-approved public contact details.
  email: "info@sankalppmc.in",
  phone: "+91 22 0000 0000",
} as const;

export const REDEVELOPMENT_BLURB =
  "Ganpati CHS is undergoing redevelopment under the project management of Sankalp Project Management Consultants Pvt. Ltd. This portal gives members a single, verified place to read approved documents, follow site progress and receive notices from the managing committee.";

export const HERO_IMAGE = "/images/ganpati-chs-building.jpg";
