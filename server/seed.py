import asyncio
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pymongo import UpdateOne

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://mongo:27017/apex-fight-club")
DB_NAME = MONGODB_URI.rsplit("/", 1)[-1].split("?", 1)[0] or "apex-fight-club"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def now():
    return datetime.now(timezone.utc)


DIRECTIONS = [
    {
        "name": "Вольная борьба",
        "slug": "wrestling",
        "color": "#70B7FF",
        "showOnHome": True,
        "isFeaturedHome": True,
        "description": "Тренировки по вольной борьбе для детей, подростков и взрослых: техника, стойка, проходы в ноги, броски и контроль.",
        "shortDescription": "Стойка, проходы, броски и контроль",
        "schedule": [
            {"day": "Пн, Ср, Пт", "time": "16:30 — 18:00", "startTime": "16:30", "endTime": "18:00", "trainer": "Шамиль Ахмедов", "group": "beginners", "age": "teens", "audience": "all"},
            {"day": "Вт, Чт", "time": "18:00 — 19:30", "startTime": "18:00", "endTime": "19:30", "trainer": "Танашев Рустам", "group": "advanced", "age": "adults", "audience": "all"},
            {"day": "Сб", "time": "10:00 — 11:30", "startTime": "10:00", "endTime": "11:30", "trainer": "Танашев Рустам", "group": "beginners", "age": "kids", "audience": "all"},
        ],
        "icon": "🤼",
        "isActive": True,
        "order": 1,
    },
    {
        "name": "Бокс",
        "slug": "boxing",
        "color": "#FFD700",
        "showOnHome": True,
        "isFeaturedHome": True,
        "description": "Классический бокс: стойка, передвижение, ударная техника, защита, работа на снарядах и спарринговая подготовка.",
        "shortDescription": "Ударная техника, защита и выносливость",
        "schedule": [
            {"day": "Пн, Ср, Пт", "time": "18:00 — 19:30", "startTime": "18:00", "endTime": "19:30", "trainer": "Алексенко Игорь", "group": "beginners", "age": "adults", "audience": "all"},
            {"day": "Вт, Чт", "time": "19:30 — 21:00", "startTime": "19:30", "endTime": "21:00", "trainer": "Шамиль Казиев", "group": "advanced", "age": "teens", "audience": "all"},
            {"day": "Сб", "time": "11:30 — 13:00", "startTime": "11:30", "endTime": "13:00", "trainer": "Шамиль Казиев", "group": "beginners", "age": "kids", "audience": "all"},
        ],
        "icon": "🥊",
        "isActive": True,
        "order": 2,
    },
    {
        "name": "Кикбоксинг",
        "slug": "kickboxing",
        "color": "#FFD700",
        "showOnHome": True,
        "isFeaturedHome": True,
        "description": "Кикбоксинг: работа руками и ногами, координация, дистанция, связки и функциональная подготовка.",
        "shortDescription": "Удары руками и ногами, динамика и форма",
        "schedule": [
            {"day": "Пн, Ср", "time": "19:30 — 21:00", "startTime": "19:30", "endTime": "21:00", "trainer": "Алексенко Игорь", "group": "advanced", "age": "adults", "audience": "all"},
            {"day": "Сб", "time": "13:00 — 14:30", "startTime": "13:00", "endTime": "14:30", "trainer": "Алексенко Игорь", "group": "beginners", "age": "teens", "audience": "all"},
        ],
        "icon": "🦵",
        "isActive": True,
        "order": 3,
    },
    {
        "name": "Дзюдо",
        "slug": "judo",
        "color": "#70B7FF",
        "showOnHome": False,
        "isFeaturedHome": False,
        "description": "Дзюдо: бросковая техника, страховка, удержания и работа в стойке и партере.",
        "shortDescription": "Броски, страховка и контроль соперника",
        "schedule": [
            {"day": "Вт, Чт", "time": "16:30 — 18:00", "startTime": "16:30", "endTime": "18:00", "trainer": "Тренер клуба", "group": "beginners", "age": "kids", "audience": "all"},
            {"day": "Сб", "time": "14:30 — 16:00", "startTime": "14:30", "endTime": "16:00", "trainer": "Тренер клуба", "group": "advanced", "age": "adults", "audience": "all"},
        ],
        "icon": "🥋",
        "isActive": True,
        "order": 4,
    },
    {
        "name": "Самбо",
        "slug": "sambo",
        "color": "#70B7FF",
        "showOnHome": False,
        "isFeaturedHome": False,
        "description": "Самбо: борьба, броски, болевые приёмы, самозащита и прикладная физическая подготовка.",
        "shortDescription": "Броски, борьба и прикладная техника",
        "schedule": [
            {"day": "Пн, Ср, Пт", "time": "15:00 — 16:30", "startTime": "15:00", "endTime": "16:30", "trainer": "Танашев Рустам", "group": "beginners", "age": "kids", "audience": "all"},
            {"day": "Вт, Чт", "time": "20:00 — 21:30", "startTime": "20:00", "endTime": "21:30", "trainer": "Танашев Рустам", "group": "competition", "age": "adults", "audience": "all"},
        ],
        "icon": "🤼",
        "isActive": True,
        "order": 5,
    },
]

TRAINERS = [
    {
        "name": "Алексенко Игорь",
        "specialization": "Бокс / Кикбоксинг",
        "specializations": ["Бокс", "Кикбоксинг"],
        "filters": ["boxing", "kickboxing"],
        "category": "boxing",
        "experience": "12 лет",
        "achievements": ["Мастер спорта по боксу", "Мастер спорта по кикбоксингу"],
        "quote": "Техника, дисциплина и характер рождаются в постоянной практике.",
        "photo": "/assets/seed/trainer-aleksenko-igor.webp",
        "isActive": True,
        "showOnHome": True,
        "isFeaturedHome": True,
        "showOnMain": True,
        "order": 1,
    },
    {
        "name": "Танашев Рустам",
        "specialization": "Вольная борьба / Самбо",
        "specializations": ["Вольная борьба", "Самбо"],
        "filters": ["wrestling", "sambo"],
        "category": "wrestling",
        "experience": "11 лет",
        "achievements": ["Мастер спорта по вольной борьбе", "Мастер спорта по самбо"],
        "quote": "Борьба формирует характер, выдержку и уверенность в себе.",
        "photo": "/assets/seed/trainer-tanashev-rustam.webp",
        "isActive": True,
        "showOnHome": True,
        "isFeaturedHome": True,
        "showOnMain": True,
        "order": 2,
    },
    {
        "name": "Шамиль Ахмедов",
        "specialization": "Вольная борьба",
        "specializations": ["Вольная борьба"],
        "filters": ["wrestling"],
        "category": "wrestling",
        "experience": "9 лет",
        "achievements": ["Мастер спорта по вольной борьбе"],
        "quote": "Сильная база и регулярная практика дают стабильный результат.",
        "photo": "/assets/seed/trainer-shamil-akhmedov.webp",
        "isActive": True,
        "showOnHome": True,
        "isFeaturedHome": True,
        "showOnMain": True,
        "order": 3,
    },
    {
        "name": "Шамиль Казиев",
        "specialization": "Бокс",
        "specializations": ["Бокс"],
        "filters": ["boxing"],
        "category": "boxing",
        "experience": "10 лет",
        "achievements": ["Мастер спорта по боксу"],
        "quote": "Системная работа и внимание к деталям помогают расти быстрее.",
        "photo": "/assets/seed/trainer-shamil-kaziev.webp",
        "isActive": True,
        "showOnHome": True,
        "isFeaturedHome": True,
        "showOnMain": True,
        "order": 4,
    },
]

PRICING = [
    {"name": "Разовое занятие", "slug": "single", "price": 800, "period": "/ занятие", "description": "Для первого знакомства или нерегулярных визитов.", "features": ["Любое направление", "Инструктаж перед занятием", "Без абонемента"], "isPopular": False, "showOnHome": True, "isFeaturedHome": True, "showOnMain": True, "isActive": True, "order": 1},
    {"name": "8 тренировок", "slug": "eight", "price": 5200, "period": "/ месяц", "description": "Оптимально для стабильного прогресса 2 раза в неделю.", "features": ["8 занятий", "Заморозка 7 дней", "Группы по уровню"], "isPopular": True, "showOnHome": True, "isFeaturedHome": True, "showOnMain": True, "isActive": True, "order": 2},
    {"name": "12 тренировок", "slug": "twelve", "price": 6900, "period": "/ месяц", "description": "Для активной подготовки и быстрого роста формы.", "features": ["12 занятий", "Заморозка 10 дней", "Приоритетная запись"], "isPopular": False, "showOnHome": True, "isFeaturedHome": True, "showOnMain": True, "isActive": True, "order": 3},
    {"name": "Безлимит", "slug": "unlimited", "price": 8900, "period": "/ месяц", "description": "Для тех, кто хочет тренироваться часто.", "features": ["Безлимитные группы", "ОФП включена", "Скидка на персоналки"], "isPopular": False, "showOnHome": True, "isFeaturedHome": True, "showOnMain": True, "isActive": True, "order": 4},
    {"name": "Персональная тренировка", "slug": "personal-single", "price": 2500, "period": "/ занятие", "description": "Индивидуальная тренировка с тренером под вашу цель и уровень подготовки.", "features": ["Персональная работа с тренером", "Коррекция техники", "Индивидуальная нагрузка"], "isPopular": False, "showOnHome": False, "isFeaturedHome": False, "showOnMain": False, "isActive": True, "order": 5},
    {"name": "10 персональных тренировок", "slug": "personal-10", "price": 21000, "period": "/ пакет", "description": "Пакет индивидуальных занятий по 2 100 ₽ за тренировку вместо 2 500 ₽.", "features": ["10 персональных тренировок", "2 100 ₽ за тренировку", "Экономия 4 000 ₽", "Гибкий график с тренером"], "isPopular": True, "showOnHome": False, "isFeaturedHome": False, "showOnMain": False, "isActive": True, "order": 6},
]

GALLERY = [
    {"title": "Фото ринга на главной", "category": "hero-ring", "image": "/assets/seed/hero-ring.jpg", "description": "Изображение слева в первом блоке главной страницы.", "order": 0, "isActive": True},
    {"title": "Фото борцовского зала на главной", "category": "hero-mat", "image": "/assets/seed/hero-wrestling-hall.webp", "description": "Изображение справа в первом блоке главной страницы.", "order": 0, "isActive": True},
    {"title": "Ринговая зона", "category": "gym", "image": "/assets/seed/hero-ring.jpg", "description": "Ринг, мешки и зона для ударной техники.", "order": 1, "isActive": True},
    {"title": "Борцовская зона", "category": "gym", "image": "/assets/seed/hero-wrestling-hall.webp", "description": "Маты для вольной борьбы, дзюдо и самбо.", "order": 2, "isActive": True},
]

DEPRECATED_DIRECTION_SLUGS = ["mma", "bjj", "muaythai", "selfdefense", "functional"]
DEPRECATED_TRAINER_NAMES = ["Игорь Морозов", "Анна Лебедева", "Елена Васильева", "Артём Николаев", "Александр Орлов", "Алексей Волков", "Мария Соколова", "Илья Романов", "Сергей Петров", "Дмитрий Козлов"]

SITE_SETTINGS = {
    "heroTitle": "Бойцовский зал для силы, техники и дисциплины",
    "heroText": "Тренировки по борьбе и ударным видам спорта для детей, подростков и взрослых. Выберите направление, посмотрите расписание и свяжитесь с клубом в удобном канале.",
    "contactTitle": "Свяжитесь с нами",
    "contactText": "Оставьте заявку на пробное занятие или задайте вопрос — мы быстро свяжемся с вами.",
    "footerText": "Школа единоборств для детей и взрослых: расписание, тренеры, направления и запись на занятия в одном месте.",
    "contacts": [
        {"type": "address", "label": "Адрес", "value": "г. Краснодар, Бородинская ул., 152/1", "url": "", "icon": "fas fa-map-marker-alt", "isActive": True},
        {"type": "phone", "label": "Телефон", "value": "+7 (495) 123-45-67", "url": "tel:+74951234567", "icon": "fas fa-phone", "isActive": True},
        {"type": "hours", "label": "Режим работы", "value": "Пн-Сб: 9:00-22:00", "url": "", "icon": "fas fa-clock", "isActive": True},
    ],
    "socials": [
        {"type": "telegram", "label": "Telegram", "value": "@imperialfightclub", "url": "https://t.me/imperialfightclub", "icon": "fab fa-telegram", "isActive": True},
        {"type": "whatsapp", "label": "WhatsApp", "value": "+7 (495) 123-45-67", "url": "https://wa.me/74951234567", "icon": "fab fa-whatsapp", "isActive": True},
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


def enrich_seed_schedule_times():
    for direction in DIRECTIONS:
        for slot in direction.get("schedule", []):
            if (slot.get("startTime") and slot.get("endTime")) or not slot.get("time"):
                continue
            normalized = slot["time"].replace("—", "-")
            if "-" in normalized:
                start, end = [part.strip() for part in normalized.split("-", 1)]
                slot["startTime"] = start
                slot["endTime"] = end
                slot["time"] = f"{start} — {end}"

enrich_seed_schedule_times()


def with_timestamps(item):
    stamped = dict(item)
    stamped.pop("createdAt", None)
    stamped["updatedAt"] = now()
    return stamped


def upsert_ops(items, key):
    return [
        UpdateOne(
            {key: item[key]},
            {"$set": with_timestamps(item), "$setOnInsert": {"createdAt": now()}},
            upsert=True,
        )
        for item in items
    ]


async def apply_seed(db):
    await db.directions.create_index("slug", unique=True)
    await db.pricings.create_index("slug", unique=True)
    await db.trainers.create_index("name", unique=True)
    await db.galleries.create_index("title", unique=True)
    await db.admins.create_index("username", unique=True)
    await db.settings.create_index("key", unique=True)

    if DEPRECATED_DIRECTION_SLUGS:
        await db.directions.update_many({"slug": {"$in": DEPRECATED_DIRECTION_SLUGS}}, {"$set": {"isActive": False, "updatedAt": now()}})
    if DEPRECATED_TRAINER_NAMES:
        await db.trainers.update_many({"name": {"$in": DEPRECATED_TRAINER_NAMES}}, {"$set": {"isActive": False, "updatedAt": now()}})
    if DIRECTIONS:
        await db.directions.bulk_write(upsert_ops(DIRECTIONS, "slug"), ordered=False)
    if TRAINERS:
        await db.trainers.bulk_write(upsert_ops(TRAINERS, "name"), ordered=False)
    if PRICING:
        await db.pricings.bulk_write(upsert_ops(PRICING, "slug"), ordered=False)
    if GALLERY:
        await db.galleries.bulk_write(upsert_ops(GALLERY, "title"), ordered=False)

    # seed settings: preserve user customizations if the document already exists
    await db.settings.update_one({"key": "site"}, {"$setOnInsert": {"key": "site", "value": SITE_SETTINGS, "createdAt": now()}}, upsert=True)

    # Вернуть стандартный заголовок/приветственный текст, если в БД остались значения из предыдущей сборки.
    await db.settings.update_one(
        {"key": "site", "value.heroTitle": "ИМПЕРИАЛ — школа единоборств для детей, подростков и взрослых"},
        {"$set": {"value.heroTitle": SITE_SETTINGS["heroTitle"], "updatedAt": now()}},
    )
    await db.settings.update_one(
        {"key": "site", "value.heroText": "Бокс, кикбоксинг, вольная борьба, дзюдо и самбо. Сильный тренерский состав, современный зал и понятное расписание для любого уровня подготовки."},
        {"$set": {"value.heroText": SITE_SETTINGS["heroText"], "updatedAt": now()}},
    )

    await db.admins.update_one(
        {"username": "admin"},
        {"$setOnInsert": {"username": "admin", "password": pwd_context.hash("password"), "createdAt": now()}},
        upsert=True,
    )


async def main():
    client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=10000)
    try:
        await client.admin.command("ping")
        db = client[DB_NAME]
        await apply_seed(db)
        print("✅ База заполнена демо-данными. Админ: admin / password")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
