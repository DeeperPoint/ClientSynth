from typing import Dict, Any
import logging

logger = logging.getLogger(__name__)


class PDFGeneratorError(RuntimeError):
    pass


class PDFGenerator:
    """Thin adapter around the mcp-dp pdf tools.

    This tries to import common entrypoints from the installed package and
    provides a simple `fill` API that returns PDF bytes.
    """

    def __init__(self):
        # Import lazily so the app can start even when package is missing
        try:
            # common structure in mcp-dp: mcp_server.tools.pdf_fill
            from mcp_server.tools import pdf_fill as _pdf_fill  # type: ignore

            self._pdf_fill = _pdf_fill
            logger.info("PDFGenerator: using mcp_server.tools.pdf_fill")
        except Exception as exc:  # pragma: no cover - depends on local package
            logger.exception("PDFGenerator: failed to import mcp-dp pdf_fill: %s", exc)
            self._pdf_fill = None

    def fill(self, template_bytes: bytes, field_map: Dict[str, Any]) -> bytes:
        """Fill a PDF template (bytes) with the given field map and return PDF bytes.

        The underlying implementation may have different function names; try a set
        of likely entrypoints and raise a clear error if none found.
        """
        if not self._pdf_fill:
            raise PDFGeneratorError("mcp-dp pdf tools are not available; ensure package is installed")

        # Try common function names
        candidates = [
            "fill_pdf_from_template_bytes",
            "fill_pdf",
            "fill",
        ]
        for name in candidates:
            fn = getattr(self._pdf_fill, name, None)
            if callable(fn):
                try:
                    return fn(template_bytes, field_map)
                except TypeError:
                    # Some implementations accept (template_path, data) instead; skip
                    continue
                except Exception as e:
                    raise PDFGeneratorError(f"pdf fill failed: {e}")

        # Last resort: if module exposes a `run` or `main` style API that operates on files
        # we could write template_bytes to a temp file and call it. Keep simple for now.
        raise PDFGeneratorError("No compatible fill function found in mcp-dp.pdf_fill")


def fill_pdf_bytes(template_bytes: bytes, field_map: Dict[str, Any]) -> bytes:
    gen = PDFGenerator()
    return gen.fill(template_bytes, field_map)

