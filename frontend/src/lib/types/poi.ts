// Point of Interest Types

export type POIType = 'monopolowy' | 'klub' | 'pub' | 'policja' | 'user';

export interface POI {
	id: string;
	name: string;
	type: POIType;
	lat: number;
	lng: number;
	danger: number; // 1-10
	description?: string;
	address?: string;
	verified?: boolean;
	createdBy?: 'system' | 'user';
	createdAt?: Date;
}

export interface UserLocation {
	lat: number;
	lng: number;
	accuracy?: number;
	timestamp?: number;
}
