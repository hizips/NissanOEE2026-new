from django.test import SimpleTestCase
from django.urls import reverse


class HealthCheckTests(SimpleTestCase):
    def test_health_check_does_not_require_authentication(self):
        response = self.client.get(reverse("health"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_health_check_accepts_load_balancer_ip_host(self):
        response = self.client.get("/health/", headers={"host": "10.0.1.25"})

        self.assertEqual(response.status_code, 200)


class ApiAuthenticationTests(SimpleTestCase):
    def test_application_api_requires_a_jwt(self):
        response = self.client.get("/api/machines/")

        self.assertEqual(response.status_code, 401)
