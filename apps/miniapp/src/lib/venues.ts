import type { VenueDto, VenuesDto } from '@altynka/core';

/** Площадки принадлежат группе; список один и тот же для листа назначения и для выбора площадки. */
export const venuesPath = (communityId: number): string => `/api/venues?communityId=${communityId}`;
export const findVenue = (venues: readonly VenueDto[] | undefined, place: string): VenueDto | undefined => venues?.find(venue => venue.name === place);
export const venueRate = (venue: VenueDto): string => venue.hourlyRate === null ? 'Цена уточняется' : `${new Intl.NumberFormat('ru-RU').format(venue.hourlyRate)} ₸ / час`;
/** A removal shows at the tap; a refused one puts the venue back where it stood. */
export const withoutVenue = (dto: VenuesDto, id: number): VenuesDto => ({ ...dto, venues: dto.venues.filter(v => v.id !== id) });
export const withVenueBack = (dto: VenuesDto, venue: VenueDto, index: number): VenuesDto =>
  dto.venues.some(v => v.id === venue.id) ? dto : { ...dto, venues: [...dto.venues.slice(0, Math.max(0, index)), venue, ...dto.venues.slice(Math.max(0, index))] };
export const is2gis = (url: string): boolean => /(^|[/.])2gis\./.test(url);
export const mapLinkLabel = (url: string): string => is2gis(url) ? 'Открыть в 2ГИС' : 'Открыть на карте';
