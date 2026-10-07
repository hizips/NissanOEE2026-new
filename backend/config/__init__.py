"""Django project package."""

# PyMySQL is a pure-Python MySQL driver, avoiding native build dependencies on
# Elastic Beanstalk. It presents the MySQLdb interface expected by Django.
try:
    import pymysql
except ImportError:  # Local SQLite installs do not need the MySQL driver.
    pymysql = None

if pymysql is not None:
    pymysql.install_as_MySQLdb()
