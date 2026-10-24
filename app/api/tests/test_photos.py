import base64

from .conftest import befriend, login

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200


def test_photo_upload_versions_and_who_sees_it(client, mails):
    reda = login(client, "reda@example.com", mails)
    kayra = login(client, "kayra@example.com", mails)
    amir = login(client, "amir@example.com", mails)
    befriend(client, reda, kayra)

    r = client.put("/api/v1/me/photo", headers=reda["headers"], json={"jpeg": base64.b64encode(JPEG).decode()})
    assert r.status_code == 200, r.text
    v = r.json()["user"]["photo"]
    assert v == 1
    # The friend sees the version in the friends list and can load it; a stranger can't
    f = client.get("/api/v1/friends", headers=kayra["headers"]).json()["friends"]
    assert f[0]["photo"] == v
    url = f"/api/v1/users/{reda['user_id']}/photo?v={v}"
    got = client.get(url, headers=kayra["headers"])
    assert got.status_code == 200 and got.content == JPEG and got.headers["content-type"] == "image/jpeg"
    assert client.get(url, headers=amir["headers"]).status_code == 404

    # A new photo is a new version; deleting goes back to none
    again = client.put("/api/v1/me/photo", headers=reda["headers"], json={"jpeg": base64.b64encode(JPEG).decode()})
    assert again.json()["user"]["photo"] == 2
    assert client.delete("/api/v1/me/photo", headers=reda["headers"]).json()["user"]["photo"] is None
    assert client.get(url, headers=kayra["headers"]).status_code == 404


def test_photo_must_be_a_jpeg(client, mails):
    reda = login(client, "reda@example.com", mails)
    png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 200).decode()
    assert client.put("/api/v1/me/photo", headers=reda["headers"], json={"jpeg": png}).json()["code"] == "photo_invalid"
    assert client.put("/api/v1/me/photo", headers=reda["headers"], json={"jpeg": "!" * 200}).json()["code"] == "photo_invalid"
