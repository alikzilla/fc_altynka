import type { VenueDto } from '@altynka/core';

/** Площадки принадлежат группе; список один и тот же для листа назначения и для выбора площадки. */
export const venuesPath = (communityId: number): string => `/api/venues?communityId=${communityId}`;
export const findVenue = (venues: readonly VenueDto[] | undefined, place: string): VenueDto | undefined => venues?.find(venue => venue.name === place);
export const venueRate = (venue: VenueDto): string => venue.hourlyRate === null ? 'Цена уточняется' : `${new Intl.NumberFormat('ru-RU').format(venue.hourlyRate)} ₸ / час`;
export const mapLinkLabel = (url: string): string => /(^|[/.])2gis\./.test(url) ? 'Открыть в 2ГИС' : 'Открыть на карте';
