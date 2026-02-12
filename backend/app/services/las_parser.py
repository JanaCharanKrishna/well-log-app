import lasio
import math
import logging
from io import StringIO

logger = logging.getLogger(__name__)

# Curve category mapping for the mud gas chromatography data
CURVE_CATEGORIES = {
    # Hydrocarbons
    "HC1": "Hydrocarbons", "HC2": "Hydrocarbons", "HC3": "Hydrocarbons",
    "HC4": "Hydrocarbons", "HC5": "Hydrocarbons", "HC6": "Hydrocarbons",
    "HC7": "Hydrocarbons", "HC8": "Hydrocarbons", "HC9": "Hydrocarbons",
    "HC10": "Hydrocarbons", "TOTAL_GAS": "Hydrocarbons", "RAW_NAPH": "Hydrocarbons",
    "nC4": "Hydrocarbons", "nC6": "Hydrocarbons", "cC6": "Hydrocarbons",
    # Normalized Hydrocarbons
    "NormC1": "Normalized", "NormC4": "Normalized", "NormC7": "Normalized",
    "NormBen_Tol": "Normalized", "NormBen": "Normalized", "NormTol": "Normalized",
    "NormHe": "Normalized", "NormH": "Normalized", "NormCO2": "Normalized",
    "NormCO2pp": "Normalized", "NormN2": "Normalized", "NormO2": "Normalized",
    "NormAr": "Normalized",
    # Pixler Ratios
    "PIX1": "Pixler Ratios", "PIX2": "Pixler Ratios",
    "PIX3": "Pixler Ratios", "PIX4": "Pixler Ratios",
    # Composition
    "Para": "Composition", "Naph": "Composition", "Arom": "Composition",
    "Ben_Tol": "Composition",
    # Aromatics
    "Benzene": "Aromatics", "Toluene": "Aromatics", "Xylene": "Aromatics",
    "TotalArom": "Aromatics", "Arom_cHex": "Aromatics", "Arom_Alk": "Aromatics",
    # Atmospheric Gases
    "Helium": "Atmospheric", "Hydrogen": "Atmospheric",
    "CO2Raw": "Atmospheric", "CO2pp": "Atmospheric", "CO2calc2": "Atmospheric",
    "N2": "Atmospheric", "O2": "Atmospheric", "Ar": "Atmospheric",
    "H2O": "Atmospheric", "Air1": "Atmospheric", "Air2": "Atmospheric",
    # Sulfur Compounds
    "SO": "Sulfur", "SO2": "Sulfur", "CS2": "Sulfur", "Sulf_HC": "Sulfur",
    # Derived Ratios
    "C3_C1": "Ratios", "C3_C2": "Ratios", "C5_C1": "Ratios",
    "nC4_C1": "Ratios", "C1_THC": "Ratios", "G_L": "Ratios",
    "HCvsW": "Ratios", "Ben_C1": "Ratios", "Ben_cHex": "Ratios",
    "Ben_cC6": "Ratios", "Ben_nC6": "Ratios", "AA_nC4": "Ratios",
    "He_C1": "Ratios", "CO2_C1": "Ratios", "Tol_nC7": "Ratios",
    "HC2_HC1": "Ratios", "HC3_HC1": "Ratios",
    "HC5_HC3": "Ratios", "HC7_HC3": "Ratios",
    "Permratio": "Ratios", "GO": "Ratios",
    # Petrophysical (Standard)
    "GR": "Petrophysics", "GAMMA": "Petrophysics", "NPHI": "Petrophysics",
    "RHOB": "Petrophysics", "DPHI": "Petrophysics", "DT": "Petrophysics",
    "ILD": "Resistivity", "ILM": "Resistivity", "LLD": "Resistivity",
    "LLS": "Resistivity", "SFLU": "Resistivity", "RES": "Resistivity",
    "CALI": "Drilling", "CAL": "Drilling", "BS": "Drilling",
    "SP": "Petrophysics", "PEF": "Petrophysics",
    # Calculated
    "Wh_calc": "Calculated", "Bh_calc": "Calculated",
    "Ch_calc": "Calculated", "C2calc": "Calculated", "MZ34": "Calculated",
    "Percent_Gas": "Calculated", "AceticAcid": "Calculated",
    # Drilling
    "ROP(min/ft)": "Drilling", "ROP(ft/hr)": "Drilling",
    "ROP": "Drilling", "BIT": "Drilling", "RPM": "Drilling",
    "WOB": "Drilling", "TQR": "Drilling",
    # OBM Corrections
    "OBMC3": "OBM Corrections", "OBMC4": "OBM Corrections",
    "OBMC5": "OBM Corrections", "OBMC6": "OBM Corrections",
    "OBMC7": "OBM Corrections", "OBMC8": "OBM Corrections",
    "OBMC9": "OBM Corrections",
    # Atmosphere
    "Atm": "Atmosphere Ratios", "Atm_TOT": "Atmosphere Ratios",
    "Atm_NormTOT": "Atmosphere Ratios",
    "N_Atm": "Atmosphere Ratios", "O_Atm": "Atmosphere Ratios",
    "Ar_Atm": "Atmosphere Ratios",
    # Other
    "TL": "Other", "HC": "Other", "ExtSen1": "Other", "ExtSen2": "Other",
    "Time": "Other", "Depth": "Index", "DEPT": "Index",
}
# Build case-insensitive lookup
_CURVE_CATEGORIES_UPPER = {k.upper(): v for k, v in CURVE_CATEGORIES.items()}


def categorize_curve(mnemonic: str) -> str:
    """Return the category for a curve mnemonic (case-insensitive)."""
    return (
        CURVE_CATEGORIES.get(mnemonic)
        or _CURVE_CATEGORIES_UPPER.get(mnemonic.upper())
        or "Other"
    )


def parse_las_file(file_content: bytes) -> dict:
    """
    Parse a LAS file from bytes.
    Returns dict with: well_info, curves, data_rows
    """
    try:
        text = file_content.decode('utf-8', errors='replace')
        las = lasio.read(StringIO(text))
    except Exception as e:
        logger.error(f"Failed to parse LAS file: {e}")
        raise ValueError(f"Invalid LAS file: {e}")

    # ── Extract well info ──
    well_info = {
        "well_name": _get_header(las, "WELL", "Unknown Well"),
        "start_depth": _get_header_float(las, "STRT"),
        "stop_depth": _get_header_float(las, "STOP"),
        "step": _get_header_float(las, "STEP"),
        "null_value": _get_header_float(las, "NULL", -9999.0),
        "las_version": _get_version(las),
        "location": _get_header(las, "LOC", None),
        "country": _get_header(las, "CTRY", None),
        "company": _get_header(las, "COMP", None),
        "field": _get_header(las, "FLD", None),
        "service_company": _get_header(las, "SRVC", None),
        "date_analyzed": _get_header(las, "DATE", None),
        "depth_unit": _get_depth_unit(las),
    }

    # ── Extract curve info ──
    curves = []
    depth_mnemonic = las.curves[0].mnemonic if las.curves else "DEPT"
    for curve in las.curves:
        if curve.mnemonic == depth_mnemonic:
            continue  # skip the depth/index column
        curves.append({
            "mnemonic": curve.mnemonic,
            "unit": curve.unit if curve.unit else "UNKN",
            "description": curve.descr if curve.descr else "",
            "category": categorize_curve(curve.mnemonic),
        })

    # ── Extract data (Optimized) ──
    df = las.df().reset_index()
    depth_col = df.columns[0]
    null_val = well_info["null_value"]
    
    # Pre-process: Replace NaN and null_val with None once
    df = df.replace({math.nan: None, null_val: None})
    
    data_rows = []
    curve_mnemonics = [c["mnemonic"] for c in curves]
    
    # Use to_dict('records') for efficient conversion to JSON-friendly list of dicts
    records = df.to_dict('records')
    for row in records:
        depth = row.get(depth_col)
        if depth is None:
            continue
        
        # Build values dict and round numerical items
        values = {}
        for mn in curve_mnemonics:
            val = row.get(mn)
            if val is not None:
                values[mn] = round(float(val), 4)
            else:
                values[mn] = None
                
        data_rows.append({
            "depth": round(float(depth), 4),
            "values": values
        })

    logger.info(
        f"Parsed LAS: {well_info['well_name']}, "
        f"{len(curves)} curves, {len(data_rows)} depth points"
    )

    return {
        "well_info": well_info,
        "curves": curves,
        "data_rows": data_rows,
    }


def _get_header(las, key, default=None):
    try:
        val = las.well[key].value
        return str(val).strip() if val else default
    except (KeyError, IndexError):
        return default


def _get_header_float(las, key, default=0.0):
    try:
        val = las.well[key].value
        return float(val) if val is not None else default
    except (KeyError, IndexError, ValueError):
        return default


def _get_version(las):
    try:
        return str(las.version[0].value).strip()
    except (KeyError, IndexError):
        return "2.0"


def _get_depth_unit(las):
    try:
        unit = las.well["STRT"].unit
        return unit.upper() if unit else "F"
    except (KeyError, IndexError):
        return "F"
