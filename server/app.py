import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
from passlib.context import CryptContext
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, ConfigDict

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
ADMIN_DIR = BASE_DIR / "admin"
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

UPLOAD_IMAGE_LIMITS = {
    "trainers": 1200,
    "gallery": 1600,
    "budget": 1800,
}
DEFAULT_UPLOAD_IMAGE_LIMIT = 1600
DIRECTION_ICON_EXTENSIONS = {".png", ".webp", ".jpg", ".jpeg", ".svg"}
UPLOAD_IMAGE_QUALITY = 82

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://mongo:27017/apex-fight-club")
DB_NAME = MONGODB_URI.rsplit("/", 1)[-1].split("?", 1)[0] or "apex-fight-club"
JWT_SECRET = os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-this-in-production")
JWT_ALGORITHM = "HS256"

app = FastAPI(title="APEX Fight Club API", version="2.0.0")
@app.exception_handler(HTTPException)
async def message_http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "message" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail, headers=getattr(exc, "headers", None))
    if isinstance(exc.detail, str):
        return JSONResponse(status_code=exc.status_code, content={"message": exc.detail}, headers=getattr(exc, "headers", None))
    return await http_exception_handler(request, exc)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client: AsyncIOMotorClient | None = None
db = None
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

COLLECTIONS = {
    "trainers": "trainers",
    "directions": "directions",
    "pricing": "pricings",
    "gallery": "galleries",
    "contacts": "contacts",
    "admins": "admins",
    "settings": "settings",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def serialize(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize(v) for v in value]
    if isinstance(value, dict):
        return {k: serialize(v) for k, v in value.items()}
    return value


def oid_or_404(item_id: str) -> ObjectId:
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=404, detail={"message": "Объект не найден"})
    return ObjectId(item_id)


def create_token(data: dict[str, Any], expires_hours: int = 24) -> str:
    payload = data.copy()
    payload["exp"] = now_utc() + timedelta(hours=expires_hours)
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_admin(request: Request) -> dict[str, Any]:
    auth = request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "", 1) if auth.startswith("Bearer ") else ""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"message": "Нет токена, авторизация отклонена"})
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {"id": payload.get("id"), "username": payload.get("username")}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"message": "Токен недействителен"})


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordIn(BaseModel):
    currentPassword: str
    newPassword: str


class ContactIn(BaseModel):
    name: str
    phone: str
    email: str = ""
    direction: str = ""
    preferredTime: str = ""
    message: str = ""
    privacyConsent: bool = False
    privacyConsentText: str = ""
    status: str = "new"

    model_config = ConfigDict(extra="allow")


async def list_items(collection: str, filter_: dict[str, Any], sort: list[tuple[str, int]]):
    cursor = db[collection].find(filter_).sort(sort)
    return [serialize(item) async for item in cursor]


async def create_item(collection: str, data: dict[str, Any]):
    data.setdefault("createdAt", now_utc())
    data.setdefault("updatedAt", now_utc())
    result = await db[collection].insert_one(data)
    item = await db[collection].find_one({"_id": result.inserted_id})
    return serialize(item)


async def update_item(collection: str, item_id: str, data: dict[str, Any], not_found: str):
    data.pop("_id", None)
    data["updatedAt"] = now_utc()
    item = await db[collection].find_one_and_update(
        {"_id": oid_or_404(item_id)},
        {"$set": data},
        return_document=ReturnDocument.AFTER,
    )
    if not item:
        raise HTTPException(status_code=404, detail={"message": not_found})
    return serialize(item)


async def delete_item(collection: str, item_id: str, message: str, not_found: str):
    item = await db[collection].find_one_and_delete({"_id": oid_or_404(item_id)})
    if not item:
        raise HTTPException(status_code=404, detail={"message": not_found})
    return {"message": message}


DEFAULT_TRAINER_NAME = "Тренер клуба"
TRAINER_PLACEHOLDER_NAMES = {
    "тренер клуба",
    "уточняйте у администратора",
    "тренер уточняется",
}


def normalize_ref(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower().replace("ё", "е"))


def split_ref_values(value: Any) -> list[str]:
    if isinstance(value, list):
        raw_values = value
    else:
        raw_values = re.split(r"\s*[·•,;/]\s*", str(value or ""))
    return [str(item or "").strip() for item in raw_values if str(item or "").strip()]


def unique_values(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = normalize_ref(value)
        if key and key not in seen:
            seen.add(key)
            result.append(value)
    return result


def clean_trainer_payload(data: dict[str, Any]) -> dict[str, Any]:
    data.pop("quote", None)
    return data


def clean_direction_payload(data: dict[str, Any]) -> dict[str, Any]:
    data.pop("homeTrainerLimit", None)
    data.pop("trainerLimit", None)
    return data


def clean_pricing_payload(data: dict[str, Any]) -> dict[str, Any]:
    data.pop("description", None)
    return data


def is_placeholder_trainer_name(value: Any) -> bool:
    return normalize_ref(value) in TRAINER_PLACEHOLDER_NAMES


async def remove_trainer_from_direction_schedules(trainer_name: str) -> int:
    target = normalize_ref(trainer_name)
    if not target:
        return 0
    touched_slots = 0
    cursor = db[COLLECTIONS["directions"]].find({"schedule": {"$exists": True}})
    async for direction in cursor:
        changed = False
        schedule = direction.get("schedule") or []
        for slot in schedule:
            if not isinstance(slot, dict):
                continue
            current_names = split_ref_values(slot.get("trainers") if slot.get("trainers") else slot.get("trainer"))
            current_names = [name for name in current_names if not is_placeholder_trainer_name(name)]
            filtered_names = unique_values([name for name in current_names if normalize_ref(name) != target])
            if len(filtered_names) == len(current_names):
                continue
            touched_slots += 1
            changed = True
            slot["trainers"] = filtered_names
            slot["trainer"] = " · ".join(filtered_names) if filtered_names else DEFAULT_TRAINER_NAME
        if changed:
            await db[COLLECTIONS["directions"]].update_one(
                {"_id": direction["_id"]},
                {"$set": {"schedule": schedule, "updatedAt": now_utc()}},
            )
    return touched_slots


def direction_ref_targets(direction: dict[str, Any]) -> set[str]:
    return {normalize_ref(direction.get("slug")), normalize_ref(direction.get("name"))} - {""}


def clean_direction_refs_from_trainer(trainer: dict[str, Any], targets: set[str]) -> dict[str, Any]:
    if not targets:
        return {}
    patch: dict[str, Any] = {}
    slug_fields = ("filters", "categories", "directions")
    label_fields = ("specializations",)
    single_slug_fields = ("category", "direction", "sport")

    for field in slug_fields + label_fields:
        values = trainer.get(field)
        if not isinstance(values, list):
            continue
        cleaned = unique_values([str(value).strip() for value in values if normalize_ref(value) not in targets])
        if cleaned != values:
            patch[field] = cleaned

    remaining_filters = patch.get("filters", trainer.get("filters") if isinstance(trainer.get("filters"), list) else [])
    for field in single_slug_fields:
        if normalize_ref(trainer.get(field)) in targets:
            patch[field] = remaining_filters[0] if remaining_filters else ""

    if trainer.get("specialization"):
        parts = split_ref_values(trainer.get("specialization"))
        cleaned_parts = unique_values([part for part in parts if normalize_ref(part) not in targets])
        if cleaned_parts != parts:
            patch["specialization"] = " / ".join(cleaned_parts)

    return patch


def replace_direction_refs_in_trainer(
    trainer: dict[str, Any],
    old_direction: dict[str, Any],
    new_direction: dict[str, Any],
) -> dict[str, Any]:
    targets = direction_ref_targets(old_direction)
    if not targets:
        return {}
    new_slug = str(new_direction.get("slug") or old_direction.get("slug") or "").strip()
    new_name = str(new_direction.get("name") or old_direction.get("name") or "").strip()
    patch: dict[str, Any] = {}

    for field in ("filters", "categories", "directions"):
        values = trainer.get(field)
        if isinstance(values, list):
            replaced = unique_values([new_slug if normalize_ref(value) in targets else str(value).strip() for value in values if str(value).strip()])
            if replaced != values:
                patch[field] = replaced

    values = trainer.get("specializations")
    if isinstance(values, list):
        replaced = unique_values([new_name if normalize_ref(value) in targets else str(value).strip() for value in values if str(value).strip()])
        if replaced != values:
            patch["specializations"] = replaced

    for field in ("category", "direction", "sport"):
        if normalize_ref(trainer.get(field)) in targets:
            patch[field] = new_slug

    if trainer.get("specialization"):
        parts = split_ref_values(trainer.get("specialization"))
        replaced_parts = unique_values([new_name if normalize_ref(part) in targets else part for part in parts])
        if replaced_parts != parts:
            patch["specialization"] = " / ".join(replaced_parts)

    return patch


async def apply_trainer_reference_patches(build_patch) -> int:
    updated = 0
    cursor = db[COLLECTIONS["trainers"]].find({})
    async for trainer in cursor:
        patch = build_patch(trainer)
        if not patch:
            continue
        patch["updatedAt"] = now_utc()
        await db[COLLECTIONS["trainers"]].update_one({"_id": trainer["_id"]}, {"$set": patch})
        updated += 1
    return updated


@app.on_event("startup")
async def startup():
    global client, db
    last_error = None
    for attempt in range(1, 6):
        try:
            client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            await client.admin.command("ping")
            db = client[DB_NAME]
            print(f"✅ MongoDB подключена: {MONGODB_URI}")
            break
        except Exception as exc:
            last_error = exc
            print(f"⏳ Попытка {attempt}/5 не удалась. Ждём 3 сек...")
            time.sleep(3)
    else:
        raise RuntimeError(f"Не удалось подключиться к MongoDB: {last_error}")

    await db[COLLECTIONS["directions"]].create_index("slug", unique=True)
    await db[COLLECTIONS["pricing"]].create_index("slug", unique=True)
    await db[COLLECTIONS["admins"]].create_index("username", unique=True)

    admin = await db[COLLECTIONS["admins"]].find_one({"username": "admin"})
    if not admin:
        await db[COLLECTIONS["admins"]].insert_one({
            "username": "admin",
            "password": pwd_context.hash("password"),
            "createdAt": now_utc(),
        })
        print("👤 Администратор создан: admin / password")
    else:
        print("👤 Администратор уже существует")


@app.on_event("shutdown")
async def shutdown():
    if client:
        client.close()


@app.post("/api/auth/login")
async def login(payload: LoginIn):
    admin = await db[COLLECTIONS["admins"]].find_one({"username": payload.username})
    if not admin or not pwd_context.verify(payload.password, admin.get("password", "")):
        raise HTTPException(status_code=400, detail={"message": "Неверный логин или пароль"})
    token = create_token({"id": str(admin["_id"]), "username": admin["username"]})
    return {"token": token, "username": admin["username"]}


@app.get("/api/auth/verify")
async def verify(admin: dict[str, Any] = Depends(get_current_admin)):
    return {"valid": True, "admin": admin}


@app.put("/api/auth/password")
async def change_password(payload: PasswordIn, admin=Depends(get_current_admin)):
    existing = await db[COLLECTIONS["admins"]].find_one({"_id": oid_or_404(admin["id"])})
    if not existing or not pwd_context.verify(payload.currentPassword, existing.get("password", "")):
        raise HTTPException(status_code=400, detail={"message": "Текущий пароль неверный"})
    await db[COLLECTIONS["admins"]].update_one({"_id": existing["_id"]}, {"$set": {"password": pwd_context.hash(payload.newPassword)}})
    return {"message": "Пароль изменён"}


@app.get("/api/trainers")
async def get_trainers(category: Optional[str] = None, includeInactive: bool = False):
    filter_: dict[str, Any] = {} if includeInactive else {"isActive": {"$ne": False}}
    if category:
        filter_["category"] = category
    return await list_items(COLLECTIONS["trainers"], filter_, [("order", 1), ("createdAt", -1)])


@app.get("/api/trainers/{trainer_id}")
async def get_trainer(trainer_id: str):
    item = await db[COLLECTIONS["trainers"]].find_one({"_id": oid_or_404(trainer_id)})
    if not item:
        raise HTTPException(status_code=404, detail={"message": "Тренер не найден"})
    return serialize(item)


@app.post("/api/trainers")
async def add_trainer(data: dict[str, Any], admin=Depends(get_current_admin)):
    return await create_item(COLLECTIONS["trainers"], clean_trainer_payload(data))


@app.put("/api/trainers/{trainer_id}")
async def edit_trainer(trainer_id: str, data: dict[str, Any], admin=Depends(get_current_admin)):
    data = clean_trainer_payload(data)
    data.pop("_id", None)
    data["updatedAt"] = now_utc()
    item = await db[COLLECTIONS["trainers"]].find_one_and_update(
        {"_id": oid_or_404(trainer_id)},
        {"$set": data, "$unset": {"quote": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if not item:
        raise HTTPException(status_code=404, detail={"message": "Тренер не найден"})
    return serialize(item)


@app.delete("/api/trainers/{trainer_id}")
async def remove_trainer(trainer_id: str, admin=Depends(get_current_admin)):
    item = await db[COLLECTIONS["trainers"]].find_one_and_delete({"_id": oid_or_404(trainer_id)})
    if not item:
        raise HTTPException(status_code=404, detail={"message": "Тренер не найден"})
    touched_slots = await remove_trainer_from_direction_schedules(item.get("name", ""))
    return {"message": "Тренер удалён", "scheduleSlotsUpdated": touched_slots}


@app.get("/api/directions")
async def get_directions(includeInactive: bool = False):
    filter_: dict[str, Any] = {} if includeInactive else {"isActive": {"$ne": False}}
    return await list_items(COLLECTIONS["directions"], filter_, [("order", 1)])


@app.get("/api/directions/{slug}")
async def get_direction(slug: str):
    item = await db[COLLECTIONS["directions"]].find_one({"slug": slug})
    if not item:
        raise HTTPException(status_code=404, detail={"message": "Направление не найдено"})
    return serialize(item)


@app.post("/api/directions")
async def add_direction(data: dict[str, Any], admin=Depends(get_current_admin)):
    return await create_item(COLLECTIONS["directions"], clean_direction_payload(data))


@app.put("/api/directions/{direction_id}")
async def edit_direction(direction_id: str, data: dict[str, Any], admin=Depends(get_current_admin)):
    direction_oid = oid_or_404(direction_id)
    old_item = await db[COLLECTIONS["directions"]].find_one({"_id": direction_oid})
    if not old_item:
        raise HTTPException(status_code=404, detail={"message": "Направление не найдено"})
    data = clean_direction_payload(data)
    data.pop("_id", None)
    data["updatedAt"] = now_utc()
    item = await db[COLLECTIONS["directions"]].find_one_and_update(
        {"_id": direction_oid},
        {"$set": data, "$unset": {"homeTrainerLimit": "", "trainerLimit": ""}},
        return_document=ReturnDocument.AFTER,
    )
    if item and (
        normalize_ref(old_item.get("slug")) != normalize_ref(item.get("slug"))
        or normalize_ref(old_item.get("name")) != normalize_ref(item.get("name"))
    ):
        await apply_trainer_reference_patches(lambda trainer: replace_direction_refs_in_trainer(trainer, old_item, item))
    return serialize(item)


@app.delete("/api/directions/{direction_id}")
async def remove_direction(direction_id: str, admin=Depends(get_current_admin)):
    item = await db[COLLECTIONS["directions"]].find_one_and_delete({"_id": oid_or_404(direction_id)})
    if not item:
        raise HTTPException(status_code=404, detail={"message": "Направление не найдено"})
    updated_trainers = await apply_trainer_reference_patches(lambda trainer: clean_direction_refs_from_trainer(trainer, direction_ref_targets(item)))
    return {"message": "Направление удалено", "trainersUpdated": updated_trainers}


@app.get("/api/pricing")
async def get_pricing(includeInactive: bool = False):
    filter_: dict[str, Any] = {} if includeInactive else {"isActive": {"$ne": False}}
    return await list_items(COLLECTIONS["pricing"], filter_, [("order", 1)])


@app.post("/api/pricing")
async def add_pricing(data: dict[str, Any], admin=Depends(get_current_admin)):
    return await create_item(COLLECTIONS["pricing"], clean_pricing_payload(data))


@app.put("/api/pricing/{pricing_id}")
async def edit_pricing(pricing_id: str, data: dict[str, Any], admin=Depends(get_current_admin)):
    return await update_item(COLLECTIONS["pricing"], pricing_id, clean_pricing_payload(data), "Тариф не найден")


@app.delete("/api/pricing/{pricing_id}")
async def remove_pricing(pricing_id: str, admin=Depends(get_current_admin)):
    return await delete_item(COLLECTIONS["pricing"], pricing_id, "Тариф удалён", "Тариф не найден")


@app.get("/api/gallery")
async def get_gallery(category: Optional[str] = None, includeInactive: bool = False):
    filter_: dict[str, Any] = {} if includeInactive else {"isActive": {"$ne": False}}
    if category:
        filter_["category"] = category
    return await list_items(COLLECTIONS["gallery"], filter_, [("order", 1), ("updatedAt", -1)])


@app.post("/api/gallery")
async def add_gallery(data: dict[str, Any], admin=Depends(get_current_admin)):
    return await create_item(COLLECTIONS["gallery"], data)


@app.put("/api/gallery/{gallery_id}")
async def edit_gallery(gallery_id: str, data: dict[str, Any], admin=Depends(get_current_admin)):
    return await update_item(COLLECTIONS["gallery"], gallery_id, data, "Фото не найдено")


@app.delete("/api/gallery/{gallery_id}")
async def remove_gallery(gallery_id: str, admin=Depends(get_current_admin)):
    return await delete_item(COLLECTIONS["gallery"], gallery_id, "Фото удалено", "Фото не найдено")


@app.post("/api/contacts", status_code=201)
async def add_contact(payload: ContactIn):
    if not payload.privacyConsent:
        raise HTTPException(status_code=400, detail={"message": "Необходимо согласие на обработку персональных данных"})
    data = payload.model_dump()
    data["privacyConsentAt"] = now_utc()
    data.setdefault("privacyConsentText", "Согласие на обработку персональных данных и принятие Политики конфиденциальности")
    return {"message": "Заявка отправлена", "contact": await create_item(COLLECTIONS["contacts"], data)}


@app.get("/api/contacts")
async def get_contacts(status: Optional[str] = None, admin=Depends(get_current_admin)):
    filter_: dict[str, Any] = {}
    if status:
        filter_["status"] = status
    return await list_items(COLLECTIONS["contacts"], filter_, [("createdAt", -1)])


@app.put("/api/contacts/{contact_id}")
async def edit_contact(contact_id: str, data: dict[str, Any], admin=Depends(get_current_admin)):
    return await update_item(COLLECTIONS["contacts"], contact_id, data, "Заявка не найдена")


@app.delete("/api/contacts/{contact_id}")
async def remove_contact(contact_id: str, admin=Depends(get_current_admin)):
    return await delete_item(COLLECTIONS["contacts"], contact_id, "Заявка удалена", "Заявка не найдена")


DEFAULT_SETTINGS = {
    "heroTitle": "Бойцовский зал для силы, техники и дисциплины",
    "heroText": "Тренировки по борьбе и ударным видам спорта для детей, подростков и взрослых. Выберите направление, посмотрите расписание и свяжитесь с клубом в удобном канале.",
    "contactTitle": "Свяжитесь с нами",
    "contactText": "Оставьте заявку на пробное занятие или задайте вопрос — мы быстро свяжемся с вами.",
    "footerText": "Школа единоборств для детей и взрослых: расписание, тренеры, направления и запись на занятия в одном месте.",
    "faqVersion": 2,
    "legal": {
        "operatorType": "ip",
        "operatorName": "",
        "inn": "",
        "ogrn": "",
        "legalAddress": "г. Краснодар, Бородинская 152/1",
        "privacyEmail": "",
        "privacyPhone": "",
        "siteDomain": "imperial-fight.ru",
        "policyUpdatedAt": "2026-05-10",
    },
    "contacts": [
        {"type": "address", "label": "Адрес", "value": "г. Краснодар, Бородинская ул., 152/1", "url": "", "icon": "fas fa-map-marker-alt", "isActive": True},
        {"type": "phone", "label": "Телефон", "value": "+7 (495) 123-45-67", "url": "tel:+74951234567", "icon": "fas fa-phone", "isActive": True},
        {"type": "hours", "label": "Режим работы", "value": "Пн-Пт: 06:00 — 22:00\nСб-Вс: 08:00 — 20:00", "url": "", "icon": "fas fa-clock", "isActive": True},
    ],
    "socials": [
        {"type": "telegram", "label": "Telegram", "value": "@imperialfightclub", "url": "https://t.me/imperialfightclub", "icon": "fab fa-telegram", "isActive": True},
        {"type": "whatsapp", "label": "WhatsApp", "value": "+7 (495) 123-45-67", "url": "https://wa.me/74951234567", "icon": "fab fa-whatsapp", "isActive": True},
    ],
    "faq": [
        {"question": "Что нужно взять с собой на первую тренировку?", "answer": "Достаточно взять спортивную форму, сменную обувь, а также полотенце и бутылку для воды. В зале есть дежурная экипировка — перчатки и шлемы, которую мы выдаём на каждом занятии, при желании тренер подробно проконсультирует вас и подскажет, какую именно экипировку и защиту лучше приобрести для дальнейших занятий.", "order": 1, "isActive": True},
        {"question": "С какого возраста вы принимаете детей?", "answer": "Мы набираем детские группы начиная с 4 лет. Для малышей (4–6 лет) тренировки проходят в игровой форме с упором на общую физическую подготовку (ОФП), координацию и дисциплину. С 7 лет начинается более глубокое изучение базовой техники единоборств.", "order": 2, "isActive": True},
        {"question": "Я никогда раньше не занимался. Меня сразу поставят в спарринг?", "answer": "Нет, это исключено. Все новички начинают с изучения базовой техники, стойки и перемещений. К парной отработке и спаррингам вы перейдете только тогда, когда будете технически и физически к этому готовы, и исключительно по вашему желанию.", "order": 3, "isActive": True},
        {"question": "Есть ли в зале душевые и раздевалки?", "answer": "Да, зал полностью оборудован для тренировок. У нас есть мужские и женские раздевалки с индивидуальными шкафчиками и современные душевыми кабинами. Вы сможете спокойно привести себя в порядок после занятия.", "order": 4, "isActive": True},
        {"question": "Предусмотрены ли у вас бюджетные (бесплатные) места?", "answer": "Да, мы поддерживаем развитие спорта и талантливых ребят. Бюджетные места предоставляются спортсменам, которые показывают высокие результаты, регулярно выступают на соревнованиях городского и регионального уровня, защищая честь клуба. Условия получения бюджетного места указаны на странице \\ref{Бюджетные места}{/budget}", "order": 5, "isActive": True},
        {"question": "Как часто нужно тренироваться, чтобы увидеть результат?", "answer": "Для поддержания формы и освоения базы новичкам оптимально посещать зал 2–3 раза в неделю. Это дает мышцам время на восстановление, а нервной системе — на усвоение новых паттернов движений.", "order": 6, "isActive": True},
        {"question": "Как записаться на первое занятие?", "answer": "Просто оставьте заявку в форме ниже. Наш администратор свяжется с вами, подберет удобное время, группу вашего уровня подготовки и ответит на оставшиеся вопросы.", "order": 7, "isActive": True},
    ],
    "budget": {
        "title": "Бюджетные места в школе единоборств",
        "intro": "Информация о бесплатных и льготных местах для учеников клуба. Ниже приведены примерные условия программы.",
        "image": "/assets/seed/budget-places.webp",
        "rules": [
            {"title": "Кто может подать заявку", "text": "Заявку могут подать ученики, которые регулярно посещают занятия и готовы соблюдать правила клуба.", "subitems": ["дети и подростки школьного возраста", "спортсмены, участвующие в соревнованиях", "семьи, которым нужна поддержка"]},
            {"title": "Какие документы нужны", "text": "Администратор клуба уточнит актуальный список документов после обращения.", "subitems": ["заявление от родителя или законного представителя", "документ, подтверждающий льготную категорию", "медицинский допуск к занятиям"]},
            {"title": "Как принимается решение", "text": "Решение принимается после собеседования и оценки свободных мест в группе.", "subitems": ["посещаемость и дисциплина", "мотивация ученика", "наличие мест по выбранному направлению"]},
        ],
    },
}

@app.get("/api/settings")
async def get_settings():
    item = await db[COLLECTIONS["settings"]].find_one({"key": "site"})
    if not item:
        return DEFAULT_SETTINGS
    data = serialize(item.get("value", {}))
    merged = {**DEFAULT_SETTINGS, **data}
    merged["legal"] = {**DEFAULT_SETTINGS.get("legal", {}), **(data.get("legal") or {})}
    if not merged.get("contacts"):
        merged["contacts"] = DEFAULT_SETTINGS["contacts"]
    if not isinstance(merged.get("faq"), list):
        merged["faq"] = DEFAULT_SETTINGS["faq"]
    return merged


@app.get("/api/direction-icons")
async def get_direction_icons():
    icon_dir = PUBLIC_DIR / "assets" / "directions"
    if not icon_dir.exists():
        return []
    files = [
        {
            "name": path.name,
            "label": path.name,
            "url": f"/assets/directions/{path.name}",
        }
        for path in icon_dir.iterdir()
        if path.is_file() and path.suffix.lower() in DIRECTION_ICON_EXTENSIONS
    ]
    return sorted(files, key=lambda item: item["name"].lower())


@app.put("/api/settings")
async def update_settings(data: dict[str, Any], admin=Depends(get_current_admin)):
    data["updatedAt"] = now_utc().isoformat()
    await db[COLLECTIONS["settings"]].update_one(
        {"key": "site"},
        {"$set": {"key": "site", "value": data, "updatedAt": now_utc()}, "$setOnInsert": {"createdAt": now_utc()}},
        upsert=True,
    )
    return {"message": "Настройки сохранены", "settings": data}


@app.post("/api/upload/{upload_type}")
async def upload_image(upload_type: str, image: UploadFile = File(...), admin=Depends(get_current_admin)):
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
    if image.content_type not in allowed:
        raise HTTPException(status_code=400, detail={"message": "Только изображения (JPEG, PNG, WebP, GIF)"})
    target_dir = UPLOADS_DIR / upload_type
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"image-{int(time.time() * 1000)}.webp"
    target = target_dir / filename
    try:
        with Image.open(image.file) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

            max_side = UPLOAD_IMAGE_LIMITS.get(upload_type, DEFAULT_UPLOAD_IMAGE_LIMIT)
            if max(img.size) > max_side:
                img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

            if img.mode == "RGBA":
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.getchannel("A"))
                img = background
            else:
                img = img.convert("RGB")

            img.save(target, "WEBP", quality=UPLOAD_IMAGE_QUALITY, method=6, optimize=True)
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail={"message": "Не удалось обработать изображение"}) from exc
    return {"url": f"/uploads/{upload_type}/{filename}", "filename": filename}


app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
app.mount("/js", StaticFiles(directory=PUBLIC_DIR / "js"), name="public-js")

@app.get("/admin", include_in_schema=False)
@app.get("/admin/", include_in_schema=False)
async def serve_admin_index():
    return FileResponse(ADMIN_DIR / "index.html")


@app.get("/admin/{admin_path:path}", include_in_schema=False)
async def serve_admin_file(admin_path: str):
    path = ADMIN_DIR / admin_path
    if admin_path and path.is_file():
        return FileResponse(path)
    return FileResponse(ADMIN_DIR / "index.html")



@app.get("/{full_path:path}")
async def serve_public(full_path: str):
    path = PUBLIC_DIR / full_path
    if full_path and path.is_file():
        return FileResponse(path)
    return FileResponse(PUBLIC_DIR / "index.html")
