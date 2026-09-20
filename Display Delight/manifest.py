import os
import json

def update_manifests():
    # 1. 强制定位到脚本所在目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir:
        os.chdir(script_dir)
    
    print(f"当前工作目录: {os.getcwd()}")

    # 2. 让用户输入新版本
    print("\n请输入新的版本号，格式为三个数字（用点、逗号或空格分隔均可）")
    print("例如: 5.1.0 或 5 1 0")
    ver_input = input(">> ").strip()

    try:
        # 清理输入，将其转换为 [int, int, int]
        for char in [',', '.', '，', '。']:
            ver_input = ver_input.replace(char, ' ')
        new_version = [int(v) for v in ver_input.split()]
        
        if len(new_version) != 3:
            print("错误: 版本号必须包含三个数字（主版本.次版本.修订号）")
            return
    except ValueError:
        print("错误: 输入包含无效字符，请输入数字！")
        return

    print(f"确认将版本号修改为: {new_version}\n")

    updated_files = 0

    # 3. 递归遍历当前目录及子目录
    for root, dirs, files in os.walk('.'):
        if 'manifest.json' in files:
            file_path = os.path.join(root, 'manifest.json')
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # --- 开始修改版本号 ---
                # 修改 Header 中的版本
                if 'header' in data and 'version' in data['header']:
                    data['header']['version'] = new_version

                # 修改 Modules 中的版本
                if 'modules' in data:
                    for module in data['modules']:
                        if 'version' in module:
                            module['version'] = new_version

                # 修改 Dependencies 中的版本 (仅针对 UUID 形式的数组版本)
                if 'dependencies' in data:
                    for dep in data['dependencies']:
                        # 检查版本是否为列表格式 [5, 0, 4]
                        # 排除字符串格式 "2.0.0" (@minecraft/server 等)
                        if 'version' in dep and isinstance(dep['version'], list):
                            dep['version'] = new_version

                # 4. 写回文件
                with open(file_path, 'w', encoding='utf-8') as f:
                    # 使用 indent=2 保持与原文件一致的缩进
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                print(f"[已更新] {file_path}")
                updated_files += 1

            except Exception as e:
                print(f"[跳过] 无法处理 {file_path}: {e}")

    print(f"\n--- 处理完成 ---")
    print(f"总计更新了 {updated_files} 个 manifest.json 文件。")

if __name__ == "__main__":
    update_manifests()