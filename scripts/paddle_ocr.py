#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
PaddleOCR 本地识别脚本（wechat-shot v4.4 OCR provider）
- 无需任何 API 密钥
- 纯本地推理，图片不出本机
- 输出 JSON: {"raw_text": "..."}  与 tencentcloud-ocr 输出契约一致

用法：
    python scripts/paddle_ocr.py --image /path/to/image.png

首次运行会自动下载 PP-OCRv4 中文模型（det + rec + cls，约 100MB），之后纯离线。
"""
import argparse
import json
import os
import sys


def run_ocr(image_path: str) -> dict:
    # NumPy 2.0 移除了 np.sctypes，而 paddleocr 2.7.3 依赖的 imgaug 0.4.0 在导入时用到它。
    # 在导入 paddleocr 前补回该属性，作为 Python 3.13 / NumPy 2.0 的兼容垫片。
    try:
        import numpy as np
        if not hasattr(np, "sctypes"):
            np.sctypes = {
                "float": (np.float32, np.float64, np.longdouble),
                "int": (np.int8, np.int16, np.int32, np.int64),
                "uint": (np.uint8, np.uint16, np.uint32, np.uint64),
                "complex": (np.complex64, np.complex128),
                "others": (np.bool_, np.object_, np.void),
            }
    except Exception:
        pass
    try:
        import cv2
        import numpy as np
        from paddleocr import PaddleOCR
    except ImportError:
        return {
            "error": "PaddleOCR 未安装。请运行: pip install paddlepaddle paddleocr",
            "raw_text": "",
        }

    # paddlepaddle 3.x 在 Windows CPU 上默认走 OneDNN 融合算子（fused_conv2d），
    # 与 PP-OCRv4 静态模型不兼容，会报 OneDnnContext does not have the input Filter。
    # 包装 paddle.inference.create_predictor，在创建 predictor 前关闭 IR 图优化与
    # MKLDNN，强制使用原生 CPU 算子，规避该崩溃（无需改动已安装的 paddleocr 包）。
    try:
        import paddle.inference as _pinf
        _orig_create_predictor = _pinf.create_predictor

        def _patched_create_predictor(config):
            try:
                config.switch_ir_optim(False)
                config.disable_mkldnn()
            except Exception:
                pass
            return _orig_create_predictor(config)

        _pinf.create_predictor = _patched_create_predictor
    except Exception:
        pass

    if not os.path.isfile(image_path):
        return {"error": f"图片不存在: {image_path}", "raw_text": ""}

    # 显式指定模型目录到 ASCII 路径，规避 Windows 中文用户名下 paddle C++ 推理库
    # 无法打开含中文路径的模型文件（analysis_predictor 报 NotFound）的问题。
    # 可用环境变量 PADDLE_OCR_MODEL_DIR 覆盖（默认 C:/paddlehome/models）。
    model_base = os.environ.get("PADDLE_OCR_MODEL_DIR", "C:/paddlehome/models")
    det_dir = os.path.join(model_base, "ch_PP-OCRv4_det_infer")
    rec_dir = os.path.join(model_base, "ch_PP-OCRv4_rec_infer")
    cls_dir = os.path.join(model_base, "ch_ppocr_mobile_v2.0_cls_infer")

    # paddleocr 2.x 支持 show_log；3.x 已移除该参数（抛 ValueError）。
    # 用 try/except 兼容两者，避免单版本参数差异导致整条 OCR 链崩溃。
    try:
        ocr = PaddleOCR(
            use_angle_cls=True,
            lang="ch",
            show_log=False,
            enable_mkldnn=False,
            det_model_dir=det_dir,
            rec_model_dir=rec_dir,
            cls_model_dir=cls_dir,
        )
    except (TypeError, ValueError):
        ocr = PaddleOCR(
            use_angle_cls=True,
            lang="ch",
            enable_mkldnn=False,
            det_model_dir=det_dir,
            rec_model_dir=rec_dir,
            cls_model_dir=cls_dir,
        )

    # 用 cv2.imdecode 读图，规避 OpenCV 在 Windows 中文路径下 imread 直接返回 None 的问题。
    img = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return {"error": f"图像解码失败: {image_path}", "raw_text": ""}

    # 2.7 旧 API：ocr.ocr(img, cls=True) 返回 list[list[[bbox, (text, conf)]]]
    result = ocr.ocr(img, cls=True)

    lines = []
    if result:
        for page in result:
            if not page:
                continue
            for line in page:
                # line = [bbox, (text, confidence)]
                if line and len(line) >= 2:
                    text_info = line[1]
                    if text_info and len(text_info) >= 1:
                        lines.append(text_info[0])

    raw_text = "\n".join(lines)
    return {"raw_text": raw_text, "line_count": len(lines)}


def main():
    parser = argparse.ArgumentParser(description="PaddleOCR local recognition")
    parser.add_argument("--image", required=True, help="Path to the image file")
    args = parser.parse_args()

    result = run_ocr(args.image)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
