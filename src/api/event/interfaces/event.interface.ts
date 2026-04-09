export interface Listing {
  eventId: string;
  eventName: string;
  eventStartDateTime: Date;
  eventStatus: string;
  shareLink: string | null;
  creatorId: string;
  creatorName: string | null;
  item: {
    name: string;
    price: number;
    images: string[];
    quantity: number;
  };
}
