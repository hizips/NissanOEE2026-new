"""Create the production schema and restricted MySQL user on first deployment."""

from __future__ import annotations

import os
import re

import pymysql
from django.core.management.base import BaseCommand, CommandError


MYSQL_IDENTIFIER = re.compile(r"^[A-Za-z0-9_]+$")


def required_environment(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise CommandError(f"{name} is required while database bootstrap is enabled")
    return value


class Command(BaseCommand):
    help = "Create the configured MySQL database and least-privilege application user."

    def handle(self, *args: object, **options: object) -> None:
        admin_password = os.getenv("DB_ADMIN_PASSWORD", "").strip()
        if not admin_password:
            self.stdout.write("Database bootstrap is disabled; skipping.")
            return

        database_name = required_environment("DB_NAME")
        database_user = required_environment("DB_USER")
        application_password = required_environment("DB_PASSWORD")
        admin_user = required_environment("DB_ADMIN_USER")
        database_host = required_environment("DB_HOST")
        database_port = int(os.getenv("DB_PORT", "3306"))
        ssl_ca = required_environment("DB_SSL_CA")

        for label, value in (
            ("DB_NAME", database_name),
            ("DB_USER", database_user),
            ("DB_ADMIN_USER", admin_user),
        ):
            if not MYSQL_IDENTIFIER.fullmatch(value):
                raise CommandError(f"{label} must contain only letters, numbers, and underscores")

        connection = pymysql.connect(
            host=database_host,
            port=database_port,
            user=admin_user,
            password=admin_password,
            charset="utf8mb4",
            autocommit=True,
            ssl={"ca": ssl_ca, "check_hostname": True},
        )
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"CREATE DATABASE IF NOT EXISTS `{database_name}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
                cursor.execute(
                    "CREATE USER IF NOT EXISTS %s@%s IDENTIFIED BY %s",
                    (database_user, "%", application_password),
                )
                cursor.execute(
                    "ALTER USER %s@%s IDENTIFIED BY %s",
                    (database_user, "%", application_password),
                )
                cursor.execute(
                    f"GRANT ALL PRIVILEGES ON `{database_name}`.* TO %s@%s",
                    (database_user, "%"),
                )
        finally:
            connection.close()

        self.stdout.write(self.style.SUCCESS("Production database bootstrap completed."))
