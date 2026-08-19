from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """API model that serializes to camelCase on the wire (per the PRD examples)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
