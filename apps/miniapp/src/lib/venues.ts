export interface Venue {
  readonly name: string;
  readonly address: string | null;
  readonly mapUrl: string;
  readonly hourlyRate: number | null;
}

export const VENUES: readonly Venue[] = [
  { name: 'Школа Аксай', address: null, mapUrl: 'https://go.2gis.com/G47G5', hourlyRate: null },
];

export const findVenue = (place: string): Venue | undefined => VENUES.find(venue => venue.name === place);
export const venueRate = (venue: Venue): string => venue.hourlyRate === null ? 'Цена уточняется' : `${new Intl.NumberFormat('ru-RU').format(venue.hourlyRate)} ₸ / час`;
