/**
 * NSW-specific normalisation — re-exports from shared _fuelcheck helpers.
 * NSW also classifies ACT stations via postcode (§4.5 spec).
 */
export {
  normaliseFuelCheckStation as normaliseNswStation,
  normaliseFuelCheckPrice as normaliseNswPrice,
  classifyActByPostcode,
  resolveState,
  FUELCHECK_FUEL_MAP,
} from '../_fuelcheck/normaliser'
