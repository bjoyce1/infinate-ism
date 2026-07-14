import { create } from "zustand";
import type { DistrictId } from "./houstonGeoConfig";

export type StreetMapActions = {
  focusDistrict: (id: DistrictId) => void;
  backToCity: () => void;
  backToDistrict: () => void;
  easeToProperty: (id: string) => void;
};

type State = {
  dayMode: boolean;
  breadcrumbDistrict: DistrictId | null;
  propertyId: string | null;
  actions: StreetMapActions | null;
  setDayMode: (v: boolean | ((prev: boolean) => boolean)) => void;
  setBreadcrumbDistrict: (id: DistrictId | null) => void;
  setPropertyId: (id: string | null) => void;
  registerActions: (a: StreetMapActions | null) => void;
};

export const useStreetPanel = create<State>((set) => ({
  dayMode: false,
  breadcrumbDistrict: null,
  propertyId: null,
  actions: null,
  setDayMode: (v) =>
    set((s) => ({ dayMode: typeof v === "function" ? (v as (p: boolean) => boolean)(s.dayMode) : v })),
  setBreadcrumbDistrict: (id) => set({ breadcrumbDistrict: id }),
  setPropertyId: (id) => set({ propertyId: id }),
  registerActions: (a) => set({ actions: a }),
}));