# /// script
# dependencies = [
#   "rich>=13",
# ]
# ///
"""
第 11 步：恢复主演示文件。

讲解台词：

    最后一步是恢复源文。这个样例本来就是演示用测试数据，可以现场改，
    也要能一键恢复。

    这个脚本会把 ``source-original.adoc`` 复制回 ``dream-of-red-chamber.adoc``。
    复原以后，几个故意保留的问题都会回来，下一场演示可以从同一个状态开始。

.. 操作::

   任何现场修改结束后运行本脚本：

   .. code-block:: bash

      uv run samples/dream-of-red-chamber-rdf-projection/11_restore_source.py

   然后可重新运行 ``04_reference_health.py`` 确认测试数据已恢复。
"""

from __future__ import annotations

import shutil
from pathlib import Path

from rich.console import Console
from rich.panel import Panel


def main() -> None:
    sample_dir = Path(__file__).resolve().parent
    restored = sample_dir / "dream-of-red-chamber.adoc"
    original = sample_dir / "source-original.adoc"
    shutil.copyfile(original, restored)
    Console().print(
        Panel(
            f"已从 source-original.adoc 恢复 {restored.name}",
            title="源文已恢复 Source Restored",
            border_style="green",
        )
    )


if __name__ == "__main__":
    main()
