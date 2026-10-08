# -*- coding: utf-8 -*-
"""
把 dist 打成单个 HTML —— 双击即开，无需服务器。

难点：Vite 产物是多个 ES module chunk（含 React.lazy 的动态 import）。
直接全部内联到一个 <script> 会因为「块级作用域变量名重复」炸掉
（Identifier 'f' has already been declared）。

方案：**每个 chunk 转成独立的 blob URL**，用 URL 解析器手工 resolve相对路径。
这样每个模块保持独立作用域，import 语义完全正确。
"""
import os, re, glob, json

ROOT = r"E:\Deployment\WorkBuddy\往来礼记"
DIST = os.path.join(ROOT, "dist")
OUTDIR = os.path.join(ROOT, "_ui_compare", "preview")
os.makedirs(OUTDIR, exist_ok=True)
OUT = os.path.join(OUTDIR, "往来礼记-v2.4.0-测试版.html")

html = open(os.path.join(DIST, "index.html"), encoding="utf-8").read()
assets = os.path.join(DIST, "assets")

css_text = "\n".join(
    open(p, encoding="utf-8").read() for p in glob.glob(os.path.join(assets, "*.css"))
)
print(f"CSS: {len(css_text)} 字符")

js_files = {}
for p in glob.glob(os.path.join(assets, "*.js")):
    js_files[os.path.basename(p)] = open(p, encoding="utf-8").read()
print(f"JS chunk: {len(js_files)} 个")

# 用 python 侧生成 loader.js：把每个 chunk 存成 blob，patch import 解析器
loader_lines = ["(function(){"]
loader_lines.append("const _m={};")
for name, code in js_files.items():
    loader_lines.append(
        f"_m[{json.dumps(name)}]={json.dumps(code)};")
loader_lines.append(r"""
const _urls={};
function _mk(name){
  if(_urls[name]) return _urls[name];
  // 把相对 import 改写成 blob 解析器能认的绝对形式
  let src=_m[name];
  src=src.replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\/[^'"]+|\.\/[^'"]+\.js)\2/g,
    (mm,pre,q,rel)=>{
      const base=rel.replace(/^\.\//,'');
      const key=base.includes('/')?null:base;
      const u=_mk(key||base);
      return pre+q+u+q;
    });
  const b=new Blob([src],{type:'text/javascript'});
  const u=URL.createObjectURL(b);
  _urls[name]=u;
  return u;
}
const main=%s;
window.__WL_MAIN=_mk(main);
})();
""")
loader_lines[-1] = loader_lines[-1] % json.dumps(
    re.search(r'src="/assets/(index-[^"]+\.js)"', html).group(1))
loader_js = "\n".join(loader_lines)

# file:// 下 SPA 深链会 404 —— 把 pathname 存进 sessionStorage，运行时还原
shim = """
<script>
(function(){
  // file:// 下 pathname 是物理路径，无法当路由用。
  // 用 hash 承载：#/persons
  if (location.protocol === 'file:' && !location.hash) {
    var m = location.pathname.match(/\\/([^\\/]+)\\.html?$/);
    location.replace(location.href + '#' + (m ? '/' + m[1] : '/'));
  }
})();
</script>
"""

# HashRouter 版入口：直接把 createBrowserRouter 换成 createHashRouter
entry = js_files[re.search(r'src="/assets/(index-[^"]+\.js)"', html).group(1)]
entry_hash = entry.replace("createBrowserRouter", "__WL_createHashRouter")
# 若产物里没有该名字（已 tree-shake 成别名），退而求其次不改
if entry_hash == entry:
    print("提示：未找到 createBrowserRouter 字面量，依赖 react-router 内部行为")

out = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover" />
<meta name="theme-color" content="#2F6B4F" />
<title>往来礼记 v2.4.0 · 测试版</title>
<style>
{css_text}
</style>
</head>
<body>
<div id="root"></div>
<script>{shim}</script>
<script type="module">
{loader_js}
import(window.__WL_MAIN);
</script>
</body>
</html>
"""

open(OUT, "w", encoding="utf-8", newline="\n").write(out)
print(f"\n生成: {OUT}\n大小: {os.path.getsize(OUT)/1024:.0f} KB")