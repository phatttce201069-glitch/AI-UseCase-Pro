from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import os
import requests
import json
from dotenv import load_dotenv

# Tải biến môi trường từ file .env
load_dotenv()

app = FastAPI(title="AI Use Case Architect API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    user_story: str
    api_key: Optional[str] = None
    language: str = "Vietnamese"
    model_name: Optional[str] = None

class UseCase(BaseModel):
    id: str
    name: str

class Relationship(BaseModel):
    source: str
    target: str
    type: str = Field(description="Loại quan hệ: 'association', 'include', hoặc 'extend'")

class UseCaseDiagram(BaseModel):
    primary_actors: List[str]
    secondary_actors: List[str]
    use_cases: List[UseCase]
    relationships: List[Relationship]

def get_api_key(req_key: Optional[str]):
    key = req_key or os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=401, detail="Không tìm thấy API Key. Hãy nhập trên web hoặc cấu hình file .env")
    return key

@app.get("/api/models")
async def get_models(api_key: Optional[str] = None):
    key = get_api_key(api_key)
    try:
        models_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
        res = requests.get(models_url)
        if res.status_code != 200:
            return {"models": ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-3.8-flash"]} # Fallback fallback
            
        models_data = res.json()
        valid_models = [
            m['name'].replace('models/', '') for m in models_data.get('models', [])
            if 'generateContent' in m.get('supportedGenerationMethods', []) and 'gemini' in m.get('name', '')
        ]
        valid_models.sort(reverse=True)
        return {"models": valid_models}
    except Exception as e:
        return {"models": ["gemini-1.5-pro", "gemini-1.5-flash"]}

@app.post("/api/generate", response_model=UseCaseDiagram)
async def generate_diagram(req: GenerateRequest):
    key = get_api_key(req.api_key)
    try:
        selected_model = req.model_name
        
        # Nếu user không chọn model, tự tìm model tốt nhất
        if not selected_model:
            models_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
            res = requests.get(models_url)
            if res.status_code == 200:
                models_data = res.json()
                valid_models = [
                    m['name'] for m in models_data.get('models', [])
                    if 'generateContent' in m.get('supportedGenerationMethods', []) and 'gemini' in m.get('name', '')
                ]
                valid_models.sort(reverse=True)
                if valid_models:
                    selected_model = valid_models[0].replace('models/', '')
            
            if not selected_model:
                selected_model = "gemini-1.5-pro" # default fallback
        
        # Format lại tên model nếu thiếu tiền tố
        if not selected_model.startswith("models/"):
            selected_model = f"models/{selected_model}"

        # ==========================================
        # AGENT 1: ARCHITECT (Tập trung 100% vào logic)
        # ==========================================
        prompt_architect = f"""
Bạn là chuyên gia System Architect cấp cao. Nhiệm vụ của bạn là bóc tách yêu cầu nghiệp vụ thành sơ đồ Use Case chi tiết.
ĐỂ ĐẢM BẢO CHÍNH XÁC, bạn phải làm theo 2 bước sau (Dùng ngôn ngữ gốc của yêu cầu):

BƯỚC 1 (THINKING): Phân tích ngắn gọn để xác định các Actor chính, Actor phụ, và ĐẶC BIỆT chú ý tìm ra các "Use Case ngầm" (VD: Xác thực OTP, Lưu log, Bắn email...) mà yêu cầu chưa nói rõ nhưng bắt buộc phải có theo logic hệ thống.
QUY TẮC NGHIÊM NGẶT VỀ ACTOR (UML CHUẨN):
1. Hệ thống đang được phân tích KHÔNG BAO GIỜ được làm Actor của chính nó (ví dụ: không được có Actor là "Hệ thống", "Hệ thống tự động").
2. Đối với các tác vụ chạy ngầm định kỳ hoặc tự động đếm ngược, BẮT BUỘC sử dụng Actor phụ mang tên "Time" (hoặc "Scheduler").
BƯỚC 2 (OUTPUT): Sinh ra chuỗi JSON NẰM TRONG CẶP DẤU ```json và ``` theo ĐÚNG cấu trúc sau:

{{
  "primary_actors": ["Tên User/Actor chính"],
  "secondary_actors": ["Tên Hệ thống bên ngoài/Actor phụ"],
  "use_cases": [
    {{"id": "uc1", "name": "Tên Chức năng 1"}}
  ],
  "relationships": [
    {{"source": "Tên Actor", "target": "uc_id", "type": "association"}},
    {{"source": "uc_id_1", "target": "uc_id_2", "type": "include"}},
    {{"source": "uc_id_3", "target": "uc_id_4", "type": "extend"}},
    {{"source": "Actor_A", "target": "Actor_B", "type": "generalization"}} 
  ]
}}

Lưu ý: type "generalization" dùng khi một Actor kế thừa quyền của Actor khác (VD: Quản trị viên kế thừa Người dùng).

Nội dung yêu cầu (User Story):
\"\"\"{req.user_story}\"\"\"
"""
        
        generate_url = f"https://generativelanguage.googleapis.com/v1beta/{selected_model}:generateContent?key={key}"
        
        # Gọi Agent 1
        payload_1 = {
            "contents": [{"parts": [{"text": prompt_architect}]}],
            "generationConfig": {"temperature": 0.2}
        }
        res_1 = requests.post(generate_url, json=payload_1)
        if res_1.status_code != 200:
            raise HTTPException(status_code=res_1.status_code, detail=f"Lỗi từ Agent 1 ({selected_model}): {res_1.text}")
            
        raw_text_1 = res_1.json()['candidates'][0]['content']['parts'][0]['text']
        
        import re
        match = re.search(r'```json\s*(.*?)\s*```', raw_text_1, re.DOTALL)
        clean_text_1 = match.group(1) if match else raw_text_1.replace("```json", "").replace("```", "").strip()
        
        parsed_json = json.loads(clean_text_1)

        # ==========================================
        # AGENT 2: TRANSLATOR (Dịch thuật bảo toàn cấu trúc)
        # ==========================================
        if req.language and req.language.lower() not in ["ngôn ngữ gốc", "original", "tiếng việt", "vietnamese"]:
            prompt_translator = f"""
Dưới đây là một JSON đại diện cho cấu trúc biểu đồ Use Case.
Nhiệm vụ của bạn: Dịch TOÀN BỘ các giá trị văn bản (Tên Actor, Tên Use Case) sang ngôn ngữ: {req.language}.
QUY TẮC SỐNG CÒN:
1. TUYỆT ĐỐI KHÔNG thay đổi các giá trị "id" (như uc1, uc2...).
2. TUYỆT ĐỐI KHÔNG thay đổi cấu trúc mảng, không thêm bớt bất kỳ phần tử nào.
3. Chỉ trả về chuỗi JSON mới NẰM TRONG CẶP DẤU ```json và ```.

Dữ liệu JSON gốc:
{json.dumps(parsed_json, ensure_ascii=False)}
"""
            payload_2 = {
                "contents": [{"parts": [{"text": prompt_translator}]}],
                "generationConfig": {"temperature": 0.0} # Nhiệt độ 0 để đảm bảo tính chính xác 100% khi dịch
            }
            res_2 = requests.post(generate_url, json=payload_2)
            if res_2.status_code == 200:
                raw_text_2 = res_2.json()['candidates'][0]['content']['parts'][0]['text']
                match_2 = re.search(r'```json\s*(.*?)\s*```', raw_text_2, re.DOTALL)
                clean_text_2 = match_2.group(1) if match_2 else raw_text_2.replace("```json", "").replace("```", "").strip()
                try:
                    parsed_json = json.loads(clean_text_2)
                except:
                    pass # Nếu Agent 2 lỗi JSON, fallback về bản gốc của Agent 1

        
        # 4. Validate bằng Pydantic Model trước khi trả về
        validated_data = UseCaseDiagram(**parsed_json)
        
        return validated_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class EditRequest(BaseModel):
    chat_message: str
    current_diagram: UseCaseDiagram
    api_key: Optional[str] = None
    language: str = "Vietnamese"
    model_name: Optional[str] = None

@app.post("/api/edit", response_model=UseCaseDiagram)
async def edit_diagram(req: EditRequest):
    key = get_api_key(req.api_key)
    try:
        selected_model = req.model_name
        if not selected_model:
            selected_model = "models/gemini-1.5-pro"
        elif not selected_model.startswith("models/"):
            selected_model = f"models/{selected_model}"

        prompt_editor = f"""
Bạn là chuyên gia System Architect. Dưới đây là cấu trúc biểu đồ Use Case hiện tại (định dạng JSON).
Khách hàng có một yêu cầu chỉnh sửa: "{req.chat_message}"

Nhiệm vụ của bạn:
1. Phân tích yêu cầu và CHỈ thay đổi/thêm/bớt những phần được yêu cầu. 
2. TUYỆT ĐỐI giữ nguyên các thành phần khác không liên quan. Không tự ý xóa, không tự ý bịa thêm.
3. Nếu thêm Use Case mới, hãy tạo một `id` duy nhất (ví dụ: `uc_new_1`).
4. Ngôn ngữ của dữ liệu trả về phải thống nhất với ngôn ngữ gốc hoặc theo ngôn ngữ yêu cầu.
5. Trả về kết quả là chuỗi JSON NẰM TRONG CẶP DẤU ```json và ``` theo đúng cấu trúc ban đầu.

Dữ liệu JSON gốc:
{json.dumps(req.current_diagram.dict(), ensure_ascii=False)}
"""
        generate_url = f"https://generativelanguage.googleapis.com/v1beta/{selected_model}:generateContent?key={key}"
        
        payload = {
            "contents": [{"parts": [{"text": prompt_editor}]}],
            "generationConfig": {"temperature": 0.1}
        }
        res = requests.post(generate_url, json=payload)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=f"Lỗi từ Editor AI: {res.text}")
            
        raw_text = res.json()['candidates'][0]['content']['parts'][0]['text']
        
        import re
        match = re.search(r'```json\s*(.*?)\s*```', raw_text, re.DOTALL)
        clean_text = match.group(1) if match else raw_text.replace("```json", "").replace("```", "").strip()
        
        parsed_json = json.loads(clean_text)
        validated_data = UseCaseDiagram(**parsed_json)
        return validated_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
def read_root():
    return {"message": "AI Use Case Architect API is running!"}
