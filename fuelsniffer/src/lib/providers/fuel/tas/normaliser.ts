/**
 * TAS FuelCheck normalisation — re-exports from shared _fuelcheck helpers with TAS defaults.
 */
export {
  normaliseFuelCheckStation as normaliseTasStation,
  normaliseFuelCheckPrice as normaliseTasPrice,
  FUELCHECK_FUEL_MAP,
} from '../_fuelcheck/normaliser'
